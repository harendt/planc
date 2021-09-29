import { Component } from '@angular/core';
import { SessionService, Session, SessionState, UserState } from './session.service';

@Component({
  selector: 'app-main',
  template: `
    <h1>Session {{session?.sessionId}}</h1>
    <h2>Users</h2>
    <ul>
      <li *ngFor="let user of session?.state?.users | keyvalue">
        {{user.value.name}}
        <span *ngIf="revealCards()">: {{user.value.points}}</span>
        <span *ngIf="!revealCards() && user.value.points != null">: x</span>
      </li>
    </ul>
    <h2>Cards</h2>
    <div *ngIf="displayCards()">
      <button mat-raised-button color="primary" *ngFor="let card of cards" (click)="setPoints(card)">{{card}}</button>
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
  styles: []
})
export class MainComponent {
  session: Session | null = null;
  cards: number[] = [0, 1, 2, 3, 5, 8, 13, 20, 40, 60, 100];

  constructor(private sessionService: SessionService) {
    sessionService.session.subscribe((session: Session | null) => { this.session = session; });
  }

  setPoints(points: number) {
    this.sessionService.setPoints(points);
  }

  resetPoints() {
    this.sessionService.resetPoints();
  }

  claimSession() {
    this.sessionService.claimSession();
  }

  revealCards(): boolean {
    if (this.session === null) return false;
    var reveal = true;
    Object.values(this.session.state.users).forEach((user) => {
      if (user.points === null) {
        reveal = false;
      }
    });
    return reveal;
  }

  displayCards(): boolean {
    if (this.session === null) return false;
    return this.session.state.users[this.session.uid]!.points === null;
  }

  displayControl(): boolean {
    if (this.session == null) return false;
    return this.session.uid === this.session.state.admin;
  }

  displayClaimSession(): boolean {
    if (this.session == null) return false;
    return this.session.state.admin === null;
  }
}
