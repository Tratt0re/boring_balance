import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { LocalPreferencesService } from '@/services/local-preferences.service';

export const onboardingGuard: CanActivateFn = () => {
  const localPreferences = inject(LocalPreferencesService);
  if (localPreferences.getOnboardingCompleted()) {
    return true;
  }
  return inject(Router).createUrlTree(['/onboarding']);
};

export const alreadyOnboardedGuard: CanActivateFn = () => {
  const localPreferences = inject(LocalPreferencesService);
  if (localPreferences.getOnboardingCompleted()) {
    return inject(Router).createUrlTree(['/']);
  }
  return true;
};
