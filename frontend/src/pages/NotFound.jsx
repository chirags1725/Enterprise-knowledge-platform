import { Link } from "react-router-dom";
import FusionMark from "../components/FusionMark";

export default function NotFound() {
  return (
    <div className="h-[70vh] flex flex-col items-center justify-center gap-4 text-center">
      <FusionMark size={40} />
      <div>
        <p className="font-display text-xl font-semibold">Page not found</p>
        <p className="text-sm text-text-faint mt-1">That route doesn't exist in the Knowledge Platform.</p>
      </div>
      <Link to="/" className="kp-btn-primary">Back to overview</Link>
    </div>
  );
}
