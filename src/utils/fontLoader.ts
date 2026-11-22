const VIETNAMESE_FONT_SAMPLE =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ★?%×+-:.,ĂÂĐÊÔƠƯăâđêôơưÁÀẢÃẠẤẦẨẪẬẮẰẲẴẶÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ';

let fontsReadySync = false;
let loadPromise: Promise<void> | null = null;

export function isGameFontsReadySync(): boolean {
  return fontsReadySync;
}

export function whenAllGameFontsLoaded(): Promise<void> {
  if (fontsReadySync) {
    return Promise.resolve();
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) {
      fontsReadySync = true;
      return;
    }

    const displayLoads = [
      '400 16px "Be Vietnam Pro"',
      '500 16px "Be Vietnam Pro"',
      '600 16px "Be Vietnam Pro"',
      '700 24px "Be Vietnam Pro"',
      '800 32px "Be Vietnam Pro"',
      '900 72px "Be Vietnam Pro"',
    ].map((descriptor) => document.fonts.load(descriptor, VIETNAMESE_FONT_SAMPLE));

    await Promise.all(displayLoads);
    await document.fonts.ready;

    // Warm Canvas 2D font cache across weights used for 3D tile & HUD textures
    const warmCanvas = document.createElement('canvas');
    warmCanvas.width = 4;
    warmCanvas.height = 4;
    const warmCtx = warmCanvas.getContext('2d');
    if (warmCtx) {
      warmCtx.font = '800 32px "Be Vietnam Pro"';
      warmCtx.measureText(VIETNAMESE_FONT_SAMPLE);
      warmCtx.font = '900 72px "Be Vietnam Pro"';
      warmCtx.measureText(VIETNAMESE_FONT_SAMPLE);
    }

    fontsReadySync = true;
  })().catch(() => {
    fontsReadySync = true;
  });

  return loadPromise;
}

export function waitForGameFonts(timeoutMs = 4000): Promise<boolean> {
  if (fontsReadySync) {
    return Promise.resolve(true);
  }
  return Promise.race([
    whenAllGameFontsLoaded().then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
}
