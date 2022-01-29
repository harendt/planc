import { Component, Inject, OnInit } from '@angular/core';
import { CookieService } from 'ngx-cookie';
import { Router } from '@angular/router';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SessionService, SessionAlreadyOpenError } from './session.service';

class LoginDialogResult {
  name: string = '';
  sessionId: string = '';
  remember: boolean = false;
};

@Component({
  selector: 'app-login-dialog',
  template: `
    <div class="login-dialog-content" mat-dialog-content>
      <mat-form-field appearance="fill">
        <mat-label>Your Name</mat-label>
        <input type="text" name="name" matInput [(ngModel)]="result.name" />
      </mat-form-field>
      <br />
      <mat-form-field appearance="fill">
        <mat-label>Session ID</mat-label>
        <input type="text" name="name" matInput [(ngModel)]="result.sessionId" />
      </mat-form-field>
      <br />
      <mat-checkbox [(ngModel)]="result.remember">Remember me</mat-checkbox>
    </div>
    <div mat-dialog-actions>
      <button mat-raised-button color="primary" [mat-dialog-close]="result" [disabled]="!isFormComplete()">Go</button>
    </div>
  `,
  styles: [
    '.login-dialog-content { overflow: visible; }',
  ]
})
export class LoginDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public result: LoginDialogResult) {
  }

  isFormComplete() {
    if (this.result.name == '') return false;
    if (this.result.sessionId == '') return false;
    return true;
  }
}

@Component({
  selector: 'app-login',
  template: '',
  styles: []
})
export class LoginComponent implements OnInit {
  constructor(
    private cookieService: CookieService,
    private dialog: MatDialog,
    private router: Router,
    private sessionService: SessionService,
  ) {}

  ngOnInit() {
    this.openLoginDialog();
  }

  loadLastLoginDialogResult(): LoginDialogResult {
    const lastUserName = this.cookieService.get('lastUserName');
    const lastSessionId = this.cookieService.get('lastSessionId');
    if (lastUserName && lastSessionId) {
      return {
        name: lastUserName,
        sessionId: lastSessionId,
        remember: true,
      };
    }
    else {
      return new LoginDialogResult();
    }
  }

  saveLoginDialogResult(result: LoginDialogResult) {
    if (result.remember) {
      const now = new Date();
      // Let cookie expire in 1 year from now
      const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      this.cookieService.put('lastUserName', result.name, {expires: expires});
      this.cookieService.put('lastSessionId', result.sessionId, {expires: expires});
    }
    else {
      this.cookieService.remove('lastUserName');
      this.cookieService.remove('lastSessionId');
    }
  }

  openLoginDialog() {
    const lastResult = this.loadLastLoginDialogResult();
    const dialogRef = this.dialog.open(LoginDialogComponent, {
      closeOnNavigation: false,
      data: lastResult,
      disableClose: true,
    });
    dialogRef.afterClosed().subscribe(result => {
      // An empty result shouldn't be possible, but on Microsoft Edge this
      // happens (for whatever reason) when the server is shut down while a
      // session was open.
      if (!result) {
        this.openLoginDialog();
        return;
      }

      this.saveLoginDialogResult(result);
      this.sessionService
        .joinSession(result.sessionId, result.name)
        .then(() => this.router.navigate(['/']))
        .catch(err => {
          if (err instanceof Error) {
            alert("Failed to join session: " + err.message);;
          }
          else {
            alert("Failed to join session");
          }
          if (err instanceof SessionAlreadyOpenError) {
            this.router.navigate(['/']);
            return;
          }
          this.openLoginDialog();
        });
    });
  }
}
