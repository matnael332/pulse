// The look, after SpaceX: a black ground, white type, outlined pill buttons, no shadows, no
// gradients. One signal colour, red: a customer at high risk, a customer leaving. Dark only.
// Two faces (fonts.ts): Noto Sans Hebrew for text in both languages, Barlow Condensed for display
// type and figures, falling back to Noto's narrow width for Hebrew titles.
import {
  Button,
  Card,
  createTheme,
  Modal,
  Paper,
  TextInput,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from "@mantine/core";

export const TEXT_FONT = [
  '"Noto Sans Hebrew Variable"',
  "system-ui",
  "-apple-system",
  '"Segoe UI"',
  "Arial",
  "sans-serif",
].join(", ");
export const DISPLAY_FONT = `"Barlow Condensed", ${TEXT_FONT}`;

// White to grey: the primary colour is white (shade 0), so a filled button is white with black type.
const ink: MantineColorsTuple = [
  "#ffffff",
  "#f2f2f2",
  "#e0e0e0",
  "#cccccc",
  "#b4b4b4",
  "#949494",
  "#6e6e6e",
  "#4a4a4a",
  "#2a2a2a",
  "#161616",
];

// Mantine's dark scale, mapped to the page: text (0), dimmed (2), borders (4), raised (6), ground (7).
const dark: MantineColorsTuple = [
  "#ffffff",
  "#d9d9d9",
  "#b4b4b4",
  "#949494",
  "#3a3a3f",
  "#26262a",
  "#161616",
  "#000000",
  "#000000",
  "#000000",
];

// The one signal colour (shade 5 on black is 5.4:1).
const red: MantineColorsTuple = [
  "#ffe9e8",
  "#ffcdc9",
  "#ff9d96",
  "#ff7a71",
  "#ff5d52",
  "#ff453a",
  "#e0352b",
  "#b8261e",
  "#8c1a14",
  "#2a0e0c",
];

export const theme = createTheme({
  fontFamily: TEXT_FONT,
  headings: { fontFamily: DISPLAY_FONT, fontWeight: "600" },
  colors: { ink, dark, red },
  primaryColor: "ink",
  primaryShade: { light: 0, dark: 0 },
  autoContrast: true,
  black: "#000000",
  white: "#ffffff",
  defaultRadius: "sm",
  radius: { xs: "4px", sm: "6px", md: "6px", lg: "6px", xl: "999px" },
  cursorType: "pointer",
  components: {
    Button: Button.extend({ defaultProps: { radius: "xl", size: "md" } }),
    Card: Card.extend({ defaultProps: { radius: "sm", padding: "xl", bg: "dark.6" } }),
    Paper: Paper.extend({ defaultProps: { radius: "sm" } }),
    TextInput: TextInput.extend({ defaultProps: { size: "md" } }),
    Modal: Modal.extend({ defaultProps: { radius: "sm", centered: true, padding: "xl" } }),
  },
});

export const cssVariables: CSSVariablesResolver = () => ({
  variables: {},
  light: {},
  dark: {
    "--mantine-color-body": "#000000",
    "--mantine-color-text": "#ffffff",
    "--mantine-color-bright": "#ffffff",
    "--mantine-color-dimmed": "#b4b4b4",
    "--mantine-color-placeholder": "#949494",
    "--mantine-color-anchor": "#ffffff",
    "--mantine-color-default": "transparent",
    "--mantine-color-default-hover": "#161616",
    "--mantine-color-default-color": "#ffffff",
    "--mantine-color-default-border": "#3a3a3f",
    "--mantine-color-error": "#ff453a",
  },
});
