/**
 * Global image fade-in handler
 * Automatically adds 'loaded' class to images when they finish loading
 */
export function initializeImageFadeIn() {
  const markIfReady = (img: HTMLImageElement) => {
    if (img.complete && img.naturalHeight !== 0) {
      img.classList.add("loaded");
    }
  };

  // Handle images that are already loaded (cached)
  const handleExistingImages = () => {
    const images = document.querySelectorAll(`img:not(.no-fade):not([src=""]`);
    images.forEach((img) => markIfReady(img as HTMLImageElement));
  };

  // Handle images that load after DOM is ready
  const handleImageLoad = (e: Event) => {
    const img = e.target as HTMLImageElement;
    if (img.tagName === "IMG") {
      img.classList.add("loaded");
    }
  };

  // Use event delegation for all images (including dynamically added ones)
  document.addEventListener("load", handleImageLoad, true);

  // Handle existing images on initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleExistingImages);
  } else {
    handleExistingImages();
  }

  // Light safety net for edge cases where load never fires (cached/broken).
  // Avoid the old 100ms busy loop — it was scanning the whole DOM constantly.
  let passes = 0;
  const checkInterval = setInterval(() => {
    passes += 1;
    handleExistingImages();
    if (passes >= 6) clearInterval(checkInterval);
  }, 1_000);
}
