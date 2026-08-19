import { useOverlayStack } from "@/stores/interface/overlayStack";

const MODAL_ID = "optimize-setup";

export function useOptimizeModal() {
  const { showModal, hideModal, isModalVisible } = useOverlayStack();
  return {
    openOptimizeModal: () => showModal(MODAL_ID),
    closeOptimizeModal: () => hideModal(MODAL_ID),
    isOptimizeModalOpen: () => isModalVisible(MODAL_ID),
    modalId: MODAL_ID,
  };
}
