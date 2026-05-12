import { ShieldCheck } from "lucide-react";
import { useReplayStore } from "../store/replayStore";

export function DisclaimerModal() {
  const acceptDisclaimer = useReplayStore((state) => state.acceptDisclaimer);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="disclaimer" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        <div className="modal-icon" aria-hidden="true">
          <ShieldCheck size={26} />
        </div>
        <h2 id="disclaimer-title">Historical Visualization Notice</h2>
        <p>
          This is a non-operational historical visualization based on public records. It is not a
          flight-training, targeting, or procedural simulation.
        </p>
        <ul>
          <li>No cockpit, autopilot, flight planning, waypoint editing, or aircraft controls.</li>
          <li>No targeting assistance, scoring, retry challenge, or damage-engineering model.</li>
          <li>Trajectory and camera presets are locked and source-attributed.</li>
        </ul>
        <button className="primary-button" type="button" onClick={acceptDisclaimer}>
          Continue to replay viewer
        </button>
      </section>
    </div>
  );
}
