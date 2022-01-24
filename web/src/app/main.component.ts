import { Component, OnDestroy } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { SessionService, Session, SessionState, SessionAlreadyOpenError, UserState } from './session.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-reconnect-dialog',
  template: `
    <div mat-dialog-content>
      <mat-spinner></mat-spinner>
      <br />
      Connection lost
    </div>
  `,
  styles: [],
})
export class ReconnectDialogComponent {
}

@Component({
  selector: 'app-main',
  template: `
    <h1>Session {{session?.sessionId}}</h1>
    <h2>Users</h2>
    <ul>
      <li *ngFor="let user of session?.state?.users | keyvalue">
        <button mat-icon-button *ngIf="displayControl()" (click)="kickUser(user.key)">
          <mat-icon>person_remove</mat-icon>
        </button>
        {{user.value.name}}
        <span *ngIf="!user.value.isSpectator && !user.value.isStale">
          <span *ngIf="revealCards()">: {{user.value.points}}</span>
          <span *ngIf="!revealCards() && user.value.points != null">: x</span>
        </span>
        <span *ngIf="user.value.isSpectator">: Spectator</span>
        <span *ngIf="user.value.isStale"> (stale)</span>
      </li>
    </ul>
    <div *ngIf="displayCards() && !spectator">
      <h2>Cards</h2>
      <mat-button-toggle-group [ngModel]="points" (ngModelChange)="setPoints($event)">
        <mat-button-toggle color="primary" *ngFor="let card of cards" value="{{card}}">{{card}}</mat-button-toggle>
      </mat-button-toggle-group>
    </div>
    <mat-checkbox [ngModel]="spectator" (ngModelChange)="setSpectator($event)">Spectator</mat-checkbox>
    <div *ngIf="revealCards()">
      <h2>Statistics</h2>
      Mean Vote: {{meanVote()}}<br />
      High Voters: {{highVoters().join(", ")}}<br />
      Low Voters: {{lowVoters().join(", ")}}
    </div>
    <div *ngIf="displayControl()">
      <h2>Control</h2>
      <button mat-raised-button color="primary" (click)="resetPoints()">Reset</button>
    </div>
    <div *ngIf="displayClaimSession()">
      <h2>Control</h2>
      <button mat-raised-button color="primary" (click)="claimSession()">Claim Session</button>
    </div>
  `,
  styles: [
    // The toolbar uses 16px horizontal padding.  That's why we use it here
    // aswell.  For the vertial padding we simply take the half of the
    // horizontal padding.
    ':host { padding: 8px 16px; display: block; }',
  ],
})
export class MainComponent implements OnDestroy {
  session: Session | null = null;
  cards: string[] = ["0", "1", "2", "3", "5", "8", "13", "20", "40", "60", "100", "?", "☕"];
  points: string | null = null;
  reconnectDialog: MatDialogRef<ReconnectDialogComponent> | null = null;
  spectator: boolean = false;
  subscriptions: Subscription[] = [];

  constructor(
    private dialog: MatDialog,
    private sessionService: SessionService,
    private router: Router,
  ) {
    this.subscriptions.push(sessionService.session$.subscribe(
      (session: Session | null) => {
        this.session = session;
        if (this.session === null) {
          this.leaveSession();
        }
        else if (!this.session.connected) {
          this.tryReconnect()
        }
      }
    ));
    this.subscriptions.push(sessionService.error$.subscribe(
      (err: Error) => {
        alert(err);
      }
    ));
  }

  ngOnDestroy() {
    this.subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
  }

  tryReconnect() {
    console.log("Trying to reconnect");
    if (this.session === null) {
      return;
    }
    if (this.session.connected) {
      // session is still/already connected
      return;
    }
    if (this.reconnectDialog !== null) {
      // already reconnecting
      return;
    }
    this.reconnectDialog = this.dialog.open(
      ReconnectDialogComponent,
      {
        disableClose: true,
      },
    );
    this.sessionService.joinSession(this.session.sessionId, this.session.name)
      .then(() => console.log("Reconnected successfully"))
      .catch(err => {
        console.log("Error while trying to reconnect");
        this.leaveSession();
      })
      .finally(() => {
        this.reconnectDialog?.close();
        this.reconnectDialog = null;
      });
  }

  leaveSession() {
    this.router.navigate(['/login']);
  }

  setPoints(value: string) {
    this.sessionService.setPoints(value);
  }

  resetPoints() {
    this.sessionService.resetPoints();
  }

  claimSession() {
    this.sessionService.claimSession();
  }

  kickUser(userId: string) {
    this.sessionService.kickUser(userId);
  }

  setSpectator(value: boolean) {
    this.spectator = value;
    this.sessionService.setSpectator(value);
  }

  private forEachUser(f: (user: UserState) => void): void {
    if (this.session === null) return;
    Object.values(this.session.state.users).forEach((user) => {
      if (!user.isSpectator) {
        f(user)
      }
    });
  }

  meanVote() {
    var num = 0;
    var sum = 0;
    this.forEachUser((user) => {
      let userVote = Number(user.points);
      if (!isNaN(userVote)) {
        num += 1;
        sum += userVote;
      }
    });
    if (num === 0) return 0;
    else return (sum / num).toFixed();
  }

  highVoters(): string[] {
    var names: string[] = [];
    var vote = 0;
    this.forEachUser((user) => {
      if (user.name === null) return;
      let userVote = Number(user.points);
      if (!isNaN(userVote)) {
        if (userVote > vote) {
          names = [user.name];
          vote = userVote;
        } else if (userVote == vote) {
          names.push(user.name);
        }
      }
    });
    return names;
  }

  lowVoters(): string[] {
    if (this.session === null) return [];
    var names: string[] = [];
    var vote = 100000;
    this.forEachUser((user) => {
      if (user.name === null) return;
      let userVote = Number(user.points);
      if (!isNaN(userVote)) {
        if (userVote < vote) {
          names = [user.name];
          vote = userVote;
        } else if (userVote == vote) {
          names.push(user.name);
        }
      }
    });
    return names;
  }

  revealCards(): boolean {
    if (this.session === null) return false;
    var reveal = true;
    this.forEachUser((user) => {
      if (user.points === null) {
        reveal = false;
      }
    });
    return reveal;
  }

  displayCards(): boolean {
    return !this.revealCards();
  }

  displayControl(): boolean {
    return this.session !== null && this.session.uid === this.session.state.admin;
  }

  displayClaimSession(): boolean {
    if (this.session == null) return false;
    return this.session.state.admin === null;
  }
}
