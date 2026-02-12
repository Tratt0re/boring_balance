import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { RootLayout } from '@/layout/root-layout/root-layout';

@Component({
  selector: 'app-root',
  imports: [RootLayout, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
