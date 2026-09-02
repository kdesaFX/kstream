import { useOverlayStack } from "@/stores/interface/overlayStack";

const MODAL_ID = "optimize-setup";

export function useOptimizeModal() {
  const { showModal, hideModal, isModalVisible } = useOverlayStack();
  const isOpen = useOverlayStack((s) => s.modalStack.includes(MODAL_ID));
  return {
    openOptimizeModal: () => showModal(MODAL_ID),
    closeOptimizeModal: () => hideModal(MODAL_ID),
    isOptimizeModalOpen: () => isModalVisible(MODAL_ID),
    isOpen,
    modalId: MODAL_ID,
  };
}
