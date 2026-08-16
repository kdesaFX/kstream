import classNames from "classnames";
import FocusTrap from "focus-trap-react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Transition } from "@/components/utils/Transition";
import {
  useInternalOverlayRouter,
  useRouterAnchorUpdate,
} from "@/hooks/useOverlayRouter";

export interface OverlayProps {
  id: string;
  children?: ReactNode;
  darken?: boolean;
}

/** How long after appearing the backdrop refuses to dismiss the overlay. */
const BACKDROP_DISMISS_GRACE_MS = 300;

/**
 * Whether a click on the darkened backdrop should close the overlay.
 *
 * Double-clicking the thing that opened the overlay lands the second click
 * here, on a backdrop that only exists because of the first one. Closing on
 * that leaves nothing on screen, so the viewer reads the whole gesture as
 * "my click did nothing" and tries again.
 */
export function shouldDismissOnBackdropClick(
  clickCount: number,
  msSinceShown: number,
): boolean {
  if (clickCount > 1) return false;
  return msSinceShown >= BACKDROP_DISMISS_GRACE_MS;
}

export function OverlayDisplay(props: { children: ReactNode }) {
  const router = useInternalOverlayRouter("hello world :)");
  const refRouter = useRef(router);

  // close router on first mount, we dont want persist routes for overlays
  useEffect(() => {
    const r = refRouter.current;
    r.close();
    return () => {
      r.close();
    };
  }, []);
  return <div className="popout-location">{props.children}</div>;
}

export function OverlayPortal(props: {
  children?: ReactNode;
  darken?: boolean;
  show?: boolean;
  close?: () => void;
  durationClass?: string;
  zIndex?: number;
}) {
  const [portalElement, setPortalElement] = useState<Element | null>(null);
  const [isReady, setIsReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shownAt = useRef(0);
  const close = props.close;
  const zIndex = props.zIndex ?? 999;

  useEffect(() => {
    if (props.show) shownAt.current = Date.now();
  }, [props.show]);

  const closeFromBackdrop = useCallback(
    (event: React.MouseEvent) => {
      if (
        !shouldDismissOnBackdropClick(event.detail, Date.now() - shownAt.current)
      )
        return;
      close?.();
    },
    [close],
  );

  useEffect(() => {
    const element = ref.current?.closest(".popout-location");
    setPortalElement(element ?? document.body);

    // Ensure DOM is ready before enabling focus trap
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 100); // Increased delay to ensure DOM is fully rendered

    return () => clearTimeout(timer);
  }, []);

  // Add global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (
        event.reason &&
        typeof event.reason === "object" &&
        "message" in event.reason
      ) {
        const message = event.reason.message;
        if (
          message &&
          typeof message === "string" &&
          message.includes("matches.call")
        ) {
          console.warn(
            "Caught focus-trap matches.call error, preventing crash:",
            event.reason,
          );
          event.preventDefault();
        }
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () =>
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
  }, []);

  return (
    <div ref={ref}>
      {portalElement
        ? createPortal(
            <Transition show={props.show} animation="none">
              <FocusTrap
                active={isReady && !!props.show}
                focusTrapOptions={{
                  allowOutsideClick: true,
                  clickOutsideDeactivates: true,
                  fallbackFocus: () => document.body,
                  returnFocusOnDeactivate: true,
                  escapeDeactivates: false, // Let our keyboard handler manage escape
                  preventScroll: true,
                  // Disable the problematic check that causes the matches.call error
                  checkCanFocusTrap: () => Promise.resolve(),
                }}
              >
                <div
                  className="popout-wrapper fixed overflow-hidden pointer-events-auto inset-0 select-none"
                  style={{ zIndex }}
                >
                  <Transition animation="fade" isChild>
                    <div
                      onClick={closeFromBackdrop}
                      className={classNames({
                        "absolute inset-0": true,
                        "bg-black opacity-90": props.darken,
                      })}
                    />
                  </Transition>
                  <Transition
                    animation="slide-up"
                    className="absolute inset-0 pointer-events-none"
                    isChild
                    durationClass={props.durationClass ?? "duration-200"}
                  >
                    {/* a tabable index that does nothing - used so focus trap doesn't error when nothing is rendered yet */}
                    <div
                      tabIndex={1}
                      className="focus:ring-0 focus:outline-none opacity-0"
                    />
                    {props.children}
                  </Transition>
                </div>
              </FocusTrap>
            </Transition>,
            portalElement,
          )
        : null}
    </div>
  );
}

export function Overlay(props: OverlayProps) {
  const router = useInternalOverlayRouter(props.id);
  const realClose = router.close;

  // listen for anchor updates
  useRouterAnchorUpdate(props.id);

  const close = useCallback(() => {
    realClose();
  }, [realClose]);

  return (
    <OverlayPortal
      close={close}
      show={router.isOverlayActive()}
      darken={props.darken}
    >
      {props.children}
    </OverlayPortal>
  );
}
