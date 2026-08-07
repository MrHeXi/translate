import {
  detectBubbles,
  detectPanels,
  groupTextTokens,
  OcrToken,
  PixelImage
} from '../services/ComicImageProcessor';

interface ImageAnalysisRequest {
  image: PixelImage;
  tokens: OcrToken[];
}

interface ImageAnalysisWorkerScope {
  onmessage: ((event: MessageEvent<ImageAnalysisRequest>) => void) | null;
  postMessage(message: unknown): void;
}

const workerScope = self as unknown as ImageAnalysisWorkerScope;

workerScope.onmessage = event => {
  try {
    const { image, tokens } = event.data;
    const panels = detectPanels(image);
    const bubbles = detectBubbles(image, tokens, panels);
    const groups = groupTextTokens(tokens, bubbles);
    workerScope.postMessage({ success: true, bubbles, groups });
  } catch (error) {
    workerScope.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Image analysis failed.'
    });
  }
};
