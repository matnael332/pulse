// The look: Apple-like. The system's own font (San Francisco on Apple devices, Segoe UI on
// Windows), one blue accent, generous space, soft corners, pill-shaped buttons, quiet borders.
import {
  Button,
  Card,
  createTheme,
  Modal,
  Paper,
  TextInput,
  type MantineColorsTuple,
} from "@mantine/core";

const SYSTEM_FONT = [
  "-apple-system",
  "BlinkMacSystemFont",
  '"SF Pro Text"',
  '"SF Hebrew"',
  '"Segoe UI"',
  "Roboto",
  '"Noto Sans Hebrew"',
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
].join(", ");

const accent: MantineColorsTuple = [
  "#e8f2fd",
  "#cfe4fb",
  "#a0c8f7",
  "#6eabf3",
  "#3b8eef",
  "#0071e3",
  "#005fc0",
  "#004c9b",
  "#003874",
  "#00244d",
];

// Apple's dark greys: text, secondary labels, separators, the raised surface (6), the base (7).
const dark: MantineColorsTuple = [
  "#f5f5f7",
  "#d1d1d6",
  "#aeaeb2",
  "#8e8e93",
  "#636366",
  "#48484a",
  "#2c2c2e",
  "#1c1c1e",
  "#121214",
  "#000000",
];

export const theme = createTheme({
  fontFamily: SYSTEM_FONT,
  fontFamilyMonospace: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
  headings: { fontFamily: SYSTEM_FONT, fontWeight: "600" },
  colors: { accent, dark },
  primaryColor: "accent",
  primaryShade: { light: 5, dark: 4 },
  defaultRadius: "md",
  radius: { xs: "6px", sm: "8px", md: "12px", lg: "18px", xl: "28px" },
  cursorType: "pointer",
  components: {
    Button: Button.extend({ defaultProps: { radius: "xl", size: "md" } }),
    Card: Card.extend({ defaultProps: { radius: "lg", padding: "xl" } }),
    Paper: Paper.extend({ defaultProps: { radius: "lg" } }),
    TextInput: TextInput.extend({ defaultProps: { size: "md" } }),
    Modal: Modal.extend({ defaultProps: { radius: "lg", centered: true, padding: "xl" } }),
  },
});
