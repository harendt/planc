use super::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::AtomicI64;
use std::time::Duration;
use tokio::sync::watch;
use tokio::sync::Mutex;

pub struct Session {
    ctx: Arc<ServiceContext>,
    session_id: String,
    max_users: usize,
    session_state_tx: Mutex<watch::Sender<SessionState>>,
    session_state_rx: watch::Receiver<SessionState>,
    next_user_id: AtomicI64,
}

impl Session {
    pub fn new(ctx: Arc<ServiceContext>, session_id: &str, max_users: usize) -> Self {
        log::info!("Session::new: Creating session \"{}\"", session_id);
        let session_id = session_id.to_string();
        let (session_state_tx, session_state_rx) = watch::channel(SessionState::default());
        let session_state_tx = Mutex::new(session_state_tx);
        let next_user_id = AtomicI64::new(1);
        Self {
            ctx,
            session_id,
            max_users,
            session_state_tx,
            session_state_rx,
            next_user_id,
        }
    }

    pub async fn join(&self, mut conn: Connection) -> Result<()> {
        // Get a unique user id for this session.
        let user_id = self
            .next_user_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
            .to_string();

        // Add user to session state.
        let add_user_result = self
            .update_state(|mut state| {
                if state.users.len() >= self.max_users {
                    Err(PlancError::MaxUsersExceeded.into())
                } else {
                    state.users.insert(user_id.clone(), UserState::default());
                    Result::Ok(state)
                }
            })
            .await;
        if let Err(err) = add_user_result {
            log::warn!(
                "Session::join: Joining \"{}\" denied: {}",
                self.session_id,
                err
            );
            conn.send(&ServerMessage::Error(format!(
                "Error joining session: {}",
                err
            )))
            .await?;
            return Ok(());
        }
        log::info!(
            "Session::join: Joined user {} to session \"{}\"",
            user_id,
            self.session_id
        );

        // Subscribe client to state updates.
        let mut sender = conn.sender();
        let mut session_state_rx = self.session_state_rx.clone();
        let cloned_user_id = user_id.clone();
        tokio::spawn(async move {
            let user_id = cloned_user_id;
            while session_state_rx.changed().await.is_ok() {
                // Clone state for some ad-hoc modifications and checks.
                let mut new_state = session_state_rx.borrow().to_owned();

                // Get a reference to this user's state or terminate this task.
                let user = if let Some(user) = new_state.users.get(&user_id) {
                    user
                } else {
                    break;
                };

                // Check if this user was kicked and stop this task if that is the case.
                if user.kicked {
                    if let Err(err) = sender
                        .send(&ServerMessage::Error(
                            "You have been kicked from the session".to_string(),
                        ))
                        .await
                    {
                        log::warn!("Session::join/send_state_task/send_kick_message: {}", err);
                    }
                    break;
                }

                // Mask kicked users.
                new_state.users.retain(|_, user| !user.kicked);

                // Mask points so they are not visible from the console.
                if new_state
                    .users
                    .values()
                    .any(|user| !user.is_spectator && user.points.is_none())
                {
                    new_state
                        .users
                        .iter_mut()
                        .filter(|&(item_user_id, _)| *item_user_id != user_id)
                        .for_each(|(_, other_user)| {
                            if other_user.points.is_some() {
                                other_user.points = Some("-1".to_string());
                            }
                        });
                }

                // Send the modified state.
                if let Err(err) = sender.send(&ServerMessage::State(new_state)).await {
                    log::warn!("Session::join/send_state_task/send_state_message: {}", err);
                    break;
                }
            }
        });

        // Send a keep-alive message every 5 seconds. This may be necessary to keep the websocket
        // connection alive when certain reverse proxies are used.
        let mut sender = conn.sender();
        tokio::spawn(async move {
            while sender.send(&ServerMessage::KeepAlive).await.is_ok() {
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });

        // Listen to messages from the connection.
        let connection_result = self.handle_connection(conn, &user_id).await;
        if let Err(ref err) = connection_result {
            log::warn!("Session::join/handle_connection: {}", err);
        }

        self.update_state(|mut state| {
            match connection_result {
                Ok(ConnectionResult::OnHold) => {
                    // Mark user as stale because user asked to hold the connection
                    log::info!(
                        "Session::join: User {} in session \"{}\" is on hold",
                        user_id,
                        self.session_id
                    );
                    state.users.get_mut(&user_id).unwrap().is_stale = true;
                }
                _ => {
                    // Remove user from state.
                    log::info!(
                        "Session::join: User {} leaving session \"{}\"",
                        user_id,
                        self.session_id
                    );
                    state.users.remove(&user_id);
                }
            };
            if state.admin.as_ref() == Some(&user_id) {
                state.admin = None;
            }
            Result::Ok(state)
        })
        .await?;

        Ok(())
    }

    async fn handle_connection(&self, mut conn: Connection, user_id: &str) -> Result<ConnectionResult> {
        while let Some(msg) = conn.recv().await {
            // Terminate the connection for kicked users.
            let user_state = self.user_state(user_id).await?;
            if user_state.kicked {
                return Err(PlancError::UserKicked.into());
            }

            let result = match msg? {
                ClientMessage::NameChange(name) if name.len() <= 32 => {
                    self.update_state(|mut state| {
                        let mut stale_duplicates: HashMap<String, UserState> = HashMap::new();
                        state.users.retain(|other_user_id, other_user| {
                            if other_user.name.as_ref() == Some(&name) && other_user.is_stale {
                                stale_duplicates.insert(other_user_id.clone(), other_user.clone());
                                false
                            }
                            else {
                                true
                            }
                        });
                        if state.users.values().all(|user| user.name.as_ref() != Some(&name)) {
                            assert!(stale_duplicates.len() <= 1);
                            match stale_duplicates.iter().next() {
                                Some((other_user_id, other_user)) => {
                                    log::info!(
                                        "Session::join: User {} takes over stale user {} in session \"{}\"",
                                        user_id,
                                        other_user_id,
                                        self.session_id
                                    );
                                    state.users.insert(user_id.to_string(), other_user.clone());
                                    state.users.get_mut(user_id).unwrap().is_stale = false;
                                }
                                None => {
                                    state.users.get_mut(user_id).unwrap().name = Some(name.clone());
                                }
                            };
                            Ok(state)
                        } else {
                            assert!(stale_duplicates.len() == 0);
                            Err(PlancError::DuplicateName.into())
                        }
                    })
                    .await
                }
                ClientMessage::SetPoints(points) if points.len() <= 8 => {
                    self.update_state(|mut state| {
                        let user_state = state.users.get_mut(user_id).unwrap();
                        if !user_state.is_spectator {
                            user_state.points = Some(points.clone());
                            Ok(state)
                        } else {
                            Err(PlancError::InvalidMessage.into())
                        }
                    })
                    .await
                }
                ClientMessage::ResetPoints => {
                    self.update_state(|mut state| {
                        if state.admin.as_deref() == Some(user_id) {
                            for user in state.users.values_mut() {
                                user.points = None;
                            }
                            Ok(state)
                        } else {
                            Err(PlancError::InsufficientPermissions.into())
                        }
                    })
                    .await
                }
                ClientMessage::Whoami => {
                    conn.send(&ServerMessage::Whoami(user_id.to_string())).await
                }
                ClientMessage::ClaimSession => {
                    self.update_state(|mut state| {
                        if state.admin.is_none() {
                            state.admin = Some(user_id.to_string());
                            log::info!("Session::handle_connection: User {} claiming session \"{}\"", user_id, self.session_id);
                            Ok(state)
                        } else {
                            Err(PlancError::InsufficientPermissions.into())
                        }
                    })
                    .await
                }
                ClientMessage::KickUser(kickee_id) => {
                    self.update_state(|mut state| {
                        if state.admin.as_deref() == Some(user_id) {
                            if let Some(kickee) = state.users.get_mut(&kickee_id) {
                                kickee.kicked = true;
                                log::info!("Session::handle_connection: Kicking user {} from session \"{}\"", kickee_id, self.session_id);
                                Ok(state)
                            } else {
                                Err(PlancError::UnknownUserId.into())
                            }
                        } else {
                            Err(PlancError::InsufficientPermissions.into())
                        }
                    })
                    .await
                }
                ClientMessage::SetSpectator(is_spectator) => {
                    self.update_state(|mut state| {
                        let mut user_state = state.users.get_mut(user_id).unwrap();
                        user_state.is_spectator = is_spectator;
                        user_state.points = None;
                        Ok(state)
                    })
                    .await
                }
                ClientMessage::HoldConnection => {
                    // Wait for connection to be closed by remote
                    if conn.recv::<ClientMessage>().await.is_none() {
                        return Ok(ConnectionResult::OnHold);
                    }
                    Err(PlancError::ConnectionNotClosedAfterHold.into())
                }
                _ => Err(PlancError::InvalidMessage.into()),
            };
            if let Err(err) = result {
                conn.send(&ServerMessage::Error(err.to_string())).await?;
                return Err(err);
            }
        }
        return Ok(ConnectionResult::Closed);
    }

    async fn update_state<F>(&self, mut func: F) -> Result<()>
    where
        F: FnMut(SessionState) -> Result<SessionState>,
    {
        let session_state_tx = self.session_state_tx.lock().await;
        let current_state = session_state_tx.borrow().clone();
        let new_state = func(current_state)?;
        session_state_tx.send(new_state).unwrap();
        Ok(())
    }

    async fn user_state(&self, user_id: &str) -> Result<UserState> {
        let session_state_tx = self.session_state_tx.lock().await;
        let current_state = session_state_tx.borrow();
        if let Some(user_state) = current_state.users.get(user_id) {
            Ok(user_state.clone())
        } else {
            Err(PlancError::UnknownUserId.into())
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        log::info!("Session::drop: Removing session \"{}\"", self.session_id);
        self.ctx.cleanup_session(&self.session_id);
    }
}

pub enum ConnectionResult {
    Closed,
    OnHold,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct SessionState {
    pub users: HashMap<String, UserState>,
    pub admin: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserState {
    pub name: Option<String>,
    pub points: Option<String>,
    pub is_spectator: bool,
    pub is_stale: bool,
    #[serde(skip)]
    pub kicked: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "tag", content = "content")]
pub enum ClientMessage {
    NameChange(String),
    SetPoints(String),
    ResetPoints,
    Whoami,
    ClaimSession,
    KickUser(String),
    SetSpectator(bool),
    HoldConnection,
}

#[derive(Debug, Serialize)]
#[serde(tag = "tag", content = "content")]
pub enum ServerMessage {
    State(SessionState),
    Whoami(String),
    Error(String),
    KeepAlive,
}
