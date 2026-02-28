import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { RootLayout } from '@/layout/root-layout/root-layout';
import { ZardToastComponent } from '@/shared/components/toast';

@Component({
  selector: 'app-root',
  imports: [RootLayout, RouterOutlet, ZardToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
