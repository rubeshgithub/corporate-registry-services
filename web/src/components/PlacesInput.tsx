"use client";

import { useEffect, useRef } from "react";

/**
 * Google Places address autocomplete input.
 *
 * Env var: NEXT_PUBLIC_GOOGLE_PLACES_API_KEY (client-side so the browser can call it).
 * The key must be restricted by HTTP referrer to your CRS domain(s) in Google Cloud
 * Console — the same key MinuteBook uses works if you add the CRS domain to its
 * allowed referrers.
 *
 * Behaviour:
 *   - Lazy-loads the Google Maps JS once per page (module-level singleton).
 *   - Restricts to Canadian addresses.
 *   - On selection, fires onPlaceSelected with parsed components, and onChange
 *     with the street value (so uncontrolled parents still see a text change).
 *   - Silently no-ops if the API key isn't set — the input still works as plain text.
 */

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

export type ParsedAddress = {
  street:     string;
  city:       string;
  province:   string;
  postalCode: string;
  country:    string;
  formatted:  string;
};

/* Module-level script loader — only loads once across all instances. */
let scriptState: "idle" | "loading" | "ready" = "idle";
const pendingCallbacks: Array<() => void> = [];

function loadPlacesScript(cb: () => void) {
  if (!API_KEY) return;
  if (scriptState === "ready") { cb(); return; }
  pendingCallbacks.push(cb);
  if (scriptState === "loading") return;
  scriptState = "loading";
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
  s.async = true;
  s.onload = () => {
    scriptState = "ready";
    pendingCallbacks.splice(0).forEach((fn) => fn());
  };
  document.head.appendChild(s);
}

interface GooglePlaceComponent { types: string[]; long_name: string }
interface GooglePlaceResult { address_components?: GooglePlaceComponent[]; formatted_address?: string }

function parseComponents(components: GooglePlaceComponent[]): Omit<ParsedAddress, "formatted"> {
  const get = (type: string) => components.find((c) => c.types.includes(type))?.long_name ?? "";
  return {
    street:     [get("street_number"), get("route")].filter(Boolean).join(" "),
    city:       get("locality") || get("sublocality_level_1") || get("administrative_area_level_3"),
    province:   get("administrative_area_level_1"),
    postalCode: get("postal_code"),
    country:    get("country"),
  };
}

type PlacesInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  onChange?:         (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPlaceSelected?:  (address: ParsedAddress) => void;
};

export default function PlacesInput({ onChange, onPlaceSelected, ...rest }: PlacesInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef    = useRef<unknown>(null);

  useEffect(() => {
    if (!API_KEY) return;
    loadPlacesScript(() => {
      const g = (window as unknown as { google?: {
        maps?: {
          places?: {
            Autocomplete: new (input: HTMLInputElement, opts: object) => {
              addListener: (event: string, cb: () => void) => void;
              getPlace: () => GooglePlaceResult;
            };
          };
          event?: { clearInstanceListeners: (o: unknown) => void };
        };
      } }).google;
      if (!inputRef.current || !g?.maps?.places) return;
      const ac = new g.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "ca" },
      });
      acRef.current = ac;
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place?.address_components) return;
        const parts  = parseComponents(place.address_components);
        const result: ParsedAddress = { ...parts, formatted: place.formatted_address ?? "" };
        onPlaceSelected?.(result);
        // Fire onChange with the formatted address so plain-text parents stay in sync.
        if (onChange && inputRef.current) {
          const value = result.formatted || parts.street;
          inputRef.current.value = value;
          const evt = { target: inputRef.current, currentTarget: inputRef.current } as React.ChangeEvent<HTMLInputElement>;
          Object.defineProperty(evt.target, "value", { value, writable: true });
          onChange(evt);
        }
      });
    });
    return () => {
      const g = (window as unknown as { google?: { maps?: { event?: { clearInstanceListeners: (o: unknown) => void } } } }).google;
      if (acRef.current && g?.maps?.event) {
        g.maps.event.clearInstanceListeners(acRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <input ref={inputRef} onChange={onChange} {...rest} />;
}
