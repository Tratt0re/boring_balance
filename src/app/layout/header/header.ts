import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from '@/shared/components/layout/header.component';

@Component({
  selector: 'app-header',
  imports: [HeaderComponent, TranslatePipe],
  templateUrl: './header.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {}
