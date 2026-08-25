import { useOverlayStack } from "@/stores/interface/overlayStack";

export type DownloadModalIntent = "default" | "ads";

export function useDownloadModal() {
  const { showModal, hideModal, isModalVisible } = useOverlayStack();
  const modalId = "download";

  return {
    openDownloadModal: (intent: DownloadModalIntent = "default") =>
      showModal(modalId, { intent } as never),
    closeDownloadModal: () => hideModal(modalId),
    isDownloadModalOpen: () => isModalVisible(modalId),
  };
}
