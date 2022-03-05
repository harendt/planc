import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject, Observable } from 'rxjs';
import { takeWhile } from 'rxjs/operators';

export class Session {
  name!: string;
  sessionId!: string;
  uid!: string;
  state!: SessionState;
  connected: boolean = false;
}

export class SessionState {
  users!: UserStateMap;
  admin!: string;
}

export interface UserStateMap {
  [key: string]: UserState;
}

export class UserState {
  name: string | null = null;
  points: number | null = null;
  isSpectator: boolean = false;
  isStale: boolean = false;
}

export class SessionAlreadyOpenError extends Error {
}

export class WebSocketError extends Error {
}

class Message {
  tag: string = '';
  content: any = null;
}

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private webSocket: WebSocket | null = null;

  private sessionSubject: BehaviorSubject<Session | null>;
  public session$: Observable<Session | null>;
  public session(): Session | null { return this.sessionSubject.value; }
  private errorSubject: Subject<Error>;
  public error$: Observable<Error>;

  constructor() {
    this.sessionSubject = new BehaviorSubject<Session | null>(null);
    this.session$ = this.sessionSubject.asObservable();
    this.errorSubject = new Subject<Error>();
    this.error$ = this.errorSubject.asObservable();
  }

  private static webSocketUrl(sessionId: string): string {
    // Establish connection to session.
    var url: string = '';
    if (window.location.protocol === 'https:') {
      url += 'wss://';
    } else {
      url += 'ws://';
    }
    url += window.location.hostname
    if (window.location.port !== "") {
      url += ':' + window.location.port;
    }
    url += '/api/';
    url += sessionId;
    return url;
  }

  public async joinSession(sessionId: string, name: string): Promise<void> {
    if (this.connected()) {
      throw new SessionAlreadyOpenError("Already joined to a session");
    }

    // Open websocket. Not using rxjs WebSocketSubject here since it displays
    // some surprising behavior.
    this.webSocket = new WebSocket(SessionService.webSocketUrl(sessionId));
    // Wait for the websocket to become open.
    await new Promise<void>((resolve, reject) => {
      this.webSocket!.onopen = (event) => {
        resolve();
      };
      this.webSocket!.onerror = (event) => {
        reject(new Error("connection error"));
      };
      this.webSocket!.onclose = (event) => {
        reject(new Error("connection closed"));
      };
    });

    // Wrap the websocket in a subject.
    let messageSubject = new Subject<Message>();
    this.webSocket.onmessage = (event) => messageSubject.next(JSON.parse(event.data));
    this.webSocket.onerror = (err) => messageSubject.error(err);
    this.webSocket.onclose = (event) => messageSubject.complete();

    // React to connection errors and closed connections.
    messageSubject.subscribe({
      error: (errorEvent: Event) => {
        const message = "Connection closed due to an error";
        console.log(message);
        this.leaveSessionWithError(new WebSocketError(message));
      },
      complete: () => {
        const message = "Connection closed by server";
        console.log(message);
        this.leaveSessionWithError(new WebSocketError(message));
      },
    });

    // Request the user id.
    this.webSocket.send(JSON.stringify({tag: "Whoami", content: null }));
    // Change the username. Also triggers a session broadcast.
    this.webSocket.send(JSON.stringify({tag: "NameChange", content: name }));

    // Receive session information.
    var uid: string | null = null;
    var state: SessionState | null = null;
    await messageSubject
      .pipe(takeWhile((message) => {
        console.log("Got initial message: " + JSON.stringify(message));
        switch (message.tag) {
          case "Error": {
            this.webSocket?.close();
            throw new Error(message.content);
            return false;
          }
          case "Whoami": {
            uid = message.content as string;
            break;
          }
          case "State": {
            state = message.content as SessionState;
            break;
          }
          case "KeepAlive": {
            break;
          }
          default: {
            throw new Error("Unexpected message tag: " + message.tag);
          }
        }
        return uid === null || state === null;
      }))
      .toPromise();

    // Update webSocket and session members.
    this.sessionSubject.next({
      name: name,
      sessionId: sessionId,
      uid: uid!,
      state: state!,
      connected: true,
    });

    // React to state changes and errors.
    messageSubject.subscribe((message) => {
      console.log("Got message: " + JSON.stringify(message));
      switch (message.tag) {
        case "Error": {
          this.leaveSessionWithError(new Error(message.content));
          break;
        }
        case "State": {
          let session = this.session();
          if (session !== null) {
            session.state = message.content as SessionState;
            this.sessionSubject.next(session);
          }
          break;
        }
        case "KeepAlive": {
          break;
        }
        default: {
          console.log("Unexpected message tag: " + JSON.stringify(message));
          break;
        }
      }
    });
  }

  public connected(): boolean {
    return Boolean(this.session()?.connected);
  }

  public holdConnection() {
    this.webSocket?.send(JSON.stringify({ tag: "HoldConnection", content: null }));
    this.closeConnection();
    let session = this.session();
    if (session !== null) {
      session.connected = false;
      this.sessionSubject.next(session);
    }
    else {
      this.leaveSessionWithError(new Error("no session"));
    }
  }

  public leaveSession() {
    this.leaveSessionWithError(null);
  }

  private closeConnection() {
    if (this.webSocket !== null) {
      this.webSocket.onerror = null;
      this.webSocket.onclose = null;
    }
    this.webSocket?.close();
  }

  private leaveSessionWithError(error: Error | null) {
    this.closeConnection();
    if (error !== null) {
      this.errorSubject.next(error);
    }
    this.sessionSubject.next(null);
  }

  public setPoints(points: string) {
    this.webSocket?.send(JSON.stringify({ tag: "SetPoints", content: points }));
  }

  resetPoints() {
    this.webSocket?.send(JSON.stringify({ tag: "ResetPoints", content: null }));
  }

  claimSession() {
    this.webSocket?.send(JSON.stringify({ tag: "ClaimSession", content: null }));
  }

  kickUser(userId: string) {
    this.webSocket?.send(JSON.stringify({ tag: "KickUser", content: userId }));
  }

  setSpectator(isSpectator: boolean) {
    this.webSocket?.send(JSON.stringify({ tag: "SetSpectator", content: isSpectator }));
  }
}
