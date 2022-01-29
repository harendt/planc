import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class LoginComponentGuard implements CanActivate {
  constructor(
    private router: Router,
    private sessionService: SessionService,
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    if (this.sessionService.session() == null) {
      return true;
    } else {
      return this.router.parseUrl('/');
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class MainComponentGuard implements CanActivate {
  constructor(
    private router: Router,
    private sessionService: SessionService,
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    if (this.sessionService.session() == null) {
      return this.router.parseUrl('/login');
    } else {
      return true;
    }
  }
}
