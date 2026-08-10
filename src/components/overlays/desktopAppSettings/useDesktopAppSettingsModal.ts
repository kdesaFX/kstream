import { useOverlayStack } from "@/stores/interface/overlayStack";

const MODAL_ID = "desktop-app-settings";

export function useDesktopAppSettingsModal() {
  const showModal = useOverlayStack((s) => s.showModal);
  const hideModal = useOverlayStack((s) => s.hideModal);
  const isModalVisible = useOverlayStack((s) => s.isModalVisible);

  return {
    openDesktopAppSettings: () => showModal(MODAL_ID),
    closeDesktopAppSettings: () => hideModal(MODAL_ID),
    isDesktopAppSettingsOpen: () => isModalVisible(MODAL_ID),
  };
}
