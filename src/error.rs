use std::fmt;

#[derive(Debug, Clone, Copy)]
pub enum PlancError {
    InvalidMessage,
    InsufficientPermissions,
    DuplicateName,
    MaxSessionsExceeded,
    MaxUsersExceeded,
    UnknownUserId,
    UserKicked,
    ConnectionNotClosedAfterHold,
}

impl fmt::Display for PlancError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl std::error::Error for PlancError {}
