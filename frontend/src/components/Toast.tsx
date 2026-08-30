import { useEffect } from "react";

interface Props {
  message: string;
  /** bump this to (re)start the auto-dismiss timer for a repeated message */
  nonce: number;
  onClose: () => void;
}

export default function Toast({ message, nonce, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [nonce, onClose]);

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
