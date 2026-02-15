import { Component, OnInit } from '@angular/core';

import { CategoriesService } from '@/services/categories.service';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

@Component({
  selector: 'app-categories-page',
  imports: [ZardSkeletonComponent],
  templateUrl: './categories-page.html',
})
export class CategoriesPage implements OnInit {
  constructor(private readonly categoriesService: CategoriesService) {}

  ngOnInit(): void {
    void this.loadCategories();
  }

  private async loadCategories(): Promise<void> {
    try {
      const categories = await this.categoriesService.list();
      console.log('[categories-page] categories:', categories);
    } catch (error) {
      console.error('[categories-page] Failed to list categories:', error);
    }
  }
}
