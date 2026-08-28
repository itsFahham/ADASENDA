import { SERVICES } from "../lib/services";
import type { ServiceKey } from "../lib/services";

interface Props {
    active: ServiceKey;
    onChange: (key: ServiceKey) => void;
    disabled: boolean;
}

/**
 * Picks which language builds and submits the transaction. All three implement
 * the same contract, so nothing else in the app changes with the choice.
 */
export function ServiceSwitch({ active, onChange, disabled }: Props) {
    return (
        <div className="service-switch" role="group" aria-label="Backend service">
            <span className="field-label">Service</span>
            <div className="service-switch-options">
                {SERVICES.map((service) => (
                    <button
                        key={service.key}
                        type="button"
                        className={`chip${service.key === active ? " is-active" : ""}`}
                        onClick={() => onChange(service.key)}
                        disabled={disabled}
                        title={service.url}
                    >
                        {service.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
