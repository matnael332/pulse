import classes from "./Wordmark.module.css";

/** The name, set as a wordmark: condensed capitals, spaced, always left to right. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className={classes.mark} style={{ fontSize: size }} dir="ltr" translate="no">
      PULSE
    </span>
  );
}
