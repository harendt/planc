import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login.component';
import { LoginComponentGuard } from './login.guard';
import { MainComponentGuard } from './login.guard';
import { MainComponent } from './main.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [LoginComponentGuard] },
  { path: '', component: MainComponent, canActivate: [MainComponentGuard] },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
