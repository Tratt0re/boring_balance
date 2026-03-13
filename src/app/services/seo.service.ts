import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { APP_CONFIG } from '../config';
import { LANDING_FAQS } from '../content/landing-content';

type HeadTagDefinition = Record<string, string>;

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  applyLandingPageMetadata(): void {
    const { seo } = APP_CONFIG;

    this.title.setTitle(seo.title);

    const tags: HeadTagDefinition[] = [
      { name: 'description', content: seo.description },
      { name: 'keywords', content: seo.keywords },
      { name: 'robots', content: seo.robots },
      { name: 'author', content: APP_CONFIG.authorName },
      { name: 'application-name', content: APP_CONFIG.brandName },
      { name: 'apple-mobile-web-app-title', content: APP_CONFIG.brandName },
      { property: 'og:title', content: seo.title },
      { property: 'og:description', content: seo.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: seo.canonicalUrl },
      { property: 'og:image', content: APP_CONFIG.socialImageUrl },
      { property: 'og:image:alt', content: APP_CONFIG.socialImageAlt },
      { property: 'og:site_name', content: APP_CONFIG.siteName },
      { property: 'og:locale', content: seo.locale },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: seo.title },
      { name: 'twitter:description', content: seo.description },
      { name: 'twitter:image', content: APP_CONFIG.socialImageUrl },
      { name: 'twitter:image:alt', content: APP_CONFIG.socialImageAlt },
    ];

    for (const tag of tags) {
      this.meta.updateTag(tag, this.buildSelector(tag));
    }

    this.setCanonicalUrl(seo.canonicalUrl);
    this.setStructuredData(this.buildStructuredData());
  }

  private buildSelector(tag: HeadTagDefinition): string {
    if (tag['property']) return `property="${tag['property']}"`;
    return `name="${tag['name']}"`;
  }

  private setCanonicalUrl(url: string): void {
    const head = this.document.head;
    let canonical = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      head.appendChild(canonical);
    }

    canonical.setAttribute('href', url);
  }

  private setStructuredData(data: unknown): void {
    const head = this.document.head;
    const scriptId = 'boring-balance-structured-data';
    let script = head.querySelector<HTMLScriptElement>(`script#${scriptId}`);

    if (!script) {
      script = this.document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      head.appendChild(script);
    }

    script.textContent = JSON.stringify(data);
  }

  private buildStructuredData() {
    const website = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: APP_CONFIG.siteName,
      url: APP_CONFIG.siteUrl,
      description: APP_CONFIG.seo.description,
      inLanguage: 'en',
    };

    const organization = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: APP_CONFIG.brandName,
      url: APP_CONFIG.siteUrl,
      logo: APP_CONFIG.socialImageUrl,
      sameAs: [APP_CONFIG.repoUrl],
    };

    const softwareApplication = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: APP_CONFIG.brandName,
      applicationCategory: 'FinanceApplication',
      applicationSubCategory: 'Desktop personal finance app',
      operatingSystem: 'Windows, macOS, Linux',
      description: APP_CONFIG.seo.description,
      url: APP_CONFIG.siteUrl,
      downloadUrl: APP_CONFIG.releaseUrl,
      isAccessibleForFree: true,
      featureList: [
        'Track balances, accounts, and net worth',
        'Log transactions and categories',
        'Review budgets and recurring entries',
        'Store personal finance data locally in SQLite',
        'Download builds through GitHub Releases',
      ],
      publisher: {
        '@type': 'Organization',
        name: APP_CONFIG.brandName,
        url: APP_CONFIG.siteUrl,
      },
      sameAs: [APP_CONFIG.repoUrl],
    };

    const faqPage = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: LANDING_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    };

    return [website, organization, softwareApplication, faqPage];
  }
}
