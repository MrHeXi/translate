interface ContentMetrics {
  textLength: number;
  linkDensity: number;
  paragraphCount: number;
  headingCount: number;
  score: number;
}

const SEMANTIC_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.article',
  '.article-content',
  '.post-content',
  '.entry-content',
  '.main-content',
  '#content',
  '#main'
].join(',');

export class MainContentDetector {
  findMainContentRoot(pageDocument: Document = document): Element {
    const body = pageDocument.body;
    if (!body) return pageDocument.documentElement;

    const semanticCandidates = this.uniqueElements(Array.from(body.querySelectorAll(SEMANTIC_SELECTORS)))
      .filter(candidate => this.isEligibleCandidate(candidate))
      .filter(candidate => {
        const metrics = this.measure(candidate, true);
        return metrics.textLength >= 20
          && (metrics.linkDensity <= 0.75 || metrics.paragraphCount > 0);
      });
    const semanticWinner = this.pickHighestScoring(semanticCandidates, true);
    if (semanticWinner) {
      return semanticWinner;
    }

    const structuralCandidates = this.uniqueElements(Array.from(body.querySelectorAll(':scope > div, :scope > section')))
      .filter(candidate => this.isEligibleCandidate(candidate));
    const structuralWinner = this.pickHighestScoring(structuralCandidates, false);
    if (!structuralWinner) return body;

    const winnerMetrics = this.measure(structuralWinner, false);
    const bodyMetrics = this.measure(body, false);
    const isSubstantial = winnerMetrics.textLength >= 200;
    const isFocused = winnerMetrics.linkDensity <= 0.55;
    const carriesEnoughPageContent = winnerMetrics.score >= bodyMetrics.score * 0.35;

    return isSubstantial && isFocused && carriesEnoughPageContent
      ? structuralWinner
      : body;
  }

  private pickHighestScoring(candidates: Element[], semantic: boolean): Element | null {
    let winner: Element | null = null;
    let winnerScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const score = this.measure(candidate, semantic).score;
      if (score > winnerScore) {
        winner = candidate;
        winnerScore = score;
      }
    }

    return winner;
  }

  private measure(element: Element, semantic: boolean): ContentMetrics {
    const text = this.getReadableText(element);
    const textLength = text.length;
    const linkTextLength = Array.from(element.querySelectorAll('a'))
      .filter(link => this.isReadableDescendant(link, element))
      .reduce((total, link) => total + this.getReadableText(link).length, 0);
    const linkDensity = textLength > 0 ? Math.min(1, linkTextLength / textLength) : 1;
    const paragraphCount = Array.from(element.querySelectorAll('p, li, blockquote'))
      .filter(node => this.isReadableDescendant(node, element))
      .length;
    const headingCount = Array.from(element.querySelectorAll('h1, h2, h3'))
      .filter(node => this.isReadableDescendant(node, element))
      .length;
    const semanticBonus = semantic ? this.getSemanticBonus(element) : 0;
    const readableTextScore = textLength * Math.pow(1 - linkDensity, 2);
    const score = readableTextScore
      + Math.min(paragraphCount, 40) * 70
      + Math.min(headingCount, 10) * 90
      + semanticBonus;

    return { textLength, linkDensity, paragraphCount, headingCount, score };
  }

  private getSemanticBonus(element: Element): number {
    if (element.tagName === 'ARTICLE') return 700;
    if (element.tagName === 'MAIN') return 550;
    if (element.getAttribute('role') === 'main') return 450;
    return 300;
  }

  private isEligibleCandidate(element: Element): boolean {
    if (element.closest('nav, header, footer, aside, [hidden], [aria-hidden="true"]')) return false;
    if (element.closest('[data-lexibridge-owned], .translation-wrapper, .translation-overlay')) return false;
    return this.getReadableText(element).length > 0;
  }

  private getReadableText(element: Element): string {
    const chunks: string[] = [];
    const walker = element.ownerDocument.createTreeWalker(element, 4, {
      acceptNode: node => {
        const parent = node.parentElement;
        if (!parent || !this.isReadableDescendant(parent, element)) return 2;
        return this.normalizeText(node.textContent || '') ? 1 : 2;
      }
    });

    let node = walker.nextNode();
    while (node) {
      chunks.push(node.textContent || '');
      node = walker.nextNode();
    }
    return this.normalizeText(chunks.join(' '));
  }

  private isReadableDescendant(element: Element, root: Element): boolean {
    const excluded = element.closest(
      'script, style, noscript, nav, header, footer, aside, [hidden], [aria-hidden="true"], [data-no-translate], [data-lexibridge-owned], .translation-wrapper, .translation-overlay'
    );
    return !excluded || !root.contains(excluded);
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private uniqueElements(elements: Element[]): Element[] {
    return Array.from(new Set(elements));
  }
}

export const mainContentDetector = new MainContentDetector();
