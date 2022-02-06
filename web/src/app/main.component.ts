import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService, Session, SessionState, UserState } from './session.service';

enum CardType {
  Plain,
  Icon,
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
        <span *ngIf="!user.value.isSpectator">
          <span *ngIf="revealCards()">:
            <span [ngSwitch]="cards.get(user.value.points!)">
              <span *ngSwitchCase="CardType.Plain">{{user.value.points}}</span>
              <mat-icon *ngSwitchCase="CardType.Icon" class="revealed-card">{{user.value.points}}</mat-icon>
            </span>
          </span>
          <span *ngIf="!revealCards() && user.value.points != null">: x</span>
        </span>
        <span *ngIf="user.value.isSpectator">: Spectator</span>
      </li>
    </ul>
    <div *ngIf="displayCards() && !spectator">
      <h2>Cards</h2>
      <p class="cards">
        <button mat-raised-button *ngFor="let card of cards.keys()" [color]="card === points ? 'primary' : 'basic'" (click)="setPoints(card)">
          <span [ngSwitch]="cards.get(card)">
            <span *ngSwitchCase="CardType.Plain">{{card}}</span>
            <mat-icon *ngSwitchCase="CardType.Icon" class="card">{{card}}</mat-icon>
          </span>
        </button>
      </p>
    </div>
    <p><mat-checkbox [ngModel]="spectator" (ngModelChange)="setSpectator($event)">Spectator</mat-checkbox></p>
    <div *ngIf="revealCards()">
      <h2>Statistics</h2>
      <p>
        Mean Vote: {{meanVote()}}<br />
        High Voters: {{highVoters().join(", ")}}<br />
        Low Voters: {{lowVoters().join(", ")}}
      </p>
    </div>
    <div *ngIf="displayControl()">
      <h2>Control</h2>
      <p><button mat-raised-button color="primary" (click)="resetPoints()">Reset</button></p>
    </div>
    <div *ngIf="displayClaimSession()">
      <h2>Control</h2>
      <p><button mat-raised-button color="primary" (click)="claimSession()">Claim Session</button></p>
    </div>
  `,
  styles: [
    // The toolbar uses 16px horizontal padding.  That's why we use it here
    // aswell.  For the vertial padding we simply take the half of the
    // horizontal padding.
    ':host { padding: 8px 16px; display: block; }',
    '.cards button { margin-right: 1em; margin-bottom: 1em; min-width: 5em; min-height: 3.5em; }',
    'mat-icon.revealed-card { font-size: 18px; vertical-align: middle; }',
    'mat-icon.card { vertical-align: middle; }',
  ],
})
export class MainComponent {
  session: Session | null = null;
  CardType = CardType; // https://stackoverflow.com/a/35835985
  cards = new Map([
    ["0", CardType.Plain],
    ["1", CardType.Plain],
    ["2", CardType.Plain],
    ["3", CardType.Plain],
    ["5", CardType.Plain],
    ["8", CardType.Plain],
    ["13", CardType.Plain],
    ["20", CardType.Plain],
    ["40", CardType.Plain],
    ["60", CardType.Plain],
    ["100", CardType.Plain],
    ["?", CardType.Plain],
    ["coffee", CardType.Icon],
  ]);
  points: string | null = null;
  spectator: boolean = false;

  constructor(
    private sessionService: SessionService,
    private router: Router,
  ) {
    sessionService.session$.subscribe((session: Session | null) => {
      this.session = session;
      if (this.session === null) {
        this.router.navigate(['/login']);
      }
      else {
        this.points = this.session.state.users[this.session.uid].points;
      }
    });
    sessionService.error$.subscribe((err: Error) => {
      alert(err);
    });
  }

  setPoints(value: string) {
    this.points = value;
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
