import type { SvgIconProps } from "@mui/material/SvgIcon";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import FormatColorTextIcon from "@mui/icons-material/FormatColorText";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";

/** Material Icons (Google) via @mui/icons-material — shared sizing for workbook chrome. */

function sizedIcon(Icon: typeof PushPinIcon, props: SvgIconProps & { size?: "xs" | "sm" | "md" }) {
  const { size = "sm", className, ...rest } = props;
  const fontSize = size === "xs" ? 16 : size === "md" ? 24 : 20;
  const classes = className ? `wk-mui-icon ${className}` : "wk-mui-icon";
  return <Icon className={classes} fontSize="inherit" sx={{ fontSize }} {...rest} aria-hidden />;
}

export function WkPinIcon({ pinned, ...props }: { pinned: boolean } & Omit<SvgIconProps, "component">) {
  return pinned
    ? sizedIcon(PushPinIcon, { size: "xs", className: "wk-pin-icon is-pinned", ...props })
    : sizedIcon(PushPinOutlinedIcon, { size: "xs", className: "wk-pin-icon", ...props });
}

export function WkFolderIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(FolderOutlinedIcon, { size: "xs", className: "wk-explorer-folder-icon", ...props });
}

export function WkExplorerChevronIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(ChevronRightIcon, { size: "xs", className: "wk-explorer-chevron", ...props });
}

export function WkAddIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(AddIcon, { size: "xs", className: "wk-explorer-new-glyph", ...props });
}

export function WkMoreVertIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(MoreVertIcon, { size: "xs", className: "wk-scenario-menu-icon", ...props });
}

export function WkSideRevealChevronIcon({ edge, ...props }: { edge: "left" | "right" } & Omit<SvgIconProps, "component">) {
  const Icon = edge === "left" ? ChevronRightIcon : ChevronLeftIcon;
  return sizedIcon(Icon, { size: "xs", className: "wk-side-reveal-tab-glyph", ...props });
}

export function WkGlossaryIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(MenuBookOutlinedIcon, { size: "xs", ...props });
}

export function WkSettingsIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(SettingsOutlinedIcon, { size: "xs", className: "pg-settings-icon", ...props });
}

export function WkHelpOutlineIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(HelpOutlineOutlinedIcon, { size: "xs", className: "wk-help-icon-svg", ...props });
}

export function WkFormatBoldIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(FormatBoldIcon, { size: "sm", ...props });
}

export function WkFormatItalicIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(FormatItalicIcon, { size: "sm", ...props });
}

export function WkStrikethroughIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(StrikethroughSIcon, { size: "sm", ...props });
}

export function WkFormatClearIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(FormatClearIcon, { size: "sm", ...props });
}

export function WkKeyboardArrowUpIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(KeyboardArrowUpIcon, { size: "xs", ...props });
}

export function WkKeyboardArrowDownIcon(props: Omit<SvgIconProps, "component">) {
  return sizedIcon(KeyboardArrowDownIcon, { size: "xs", ...props });
}

export function WkTextColorIcon({ color }: { color: string }) {
  return (
    <span className="wk-color-icon">
      <FormatColorTextIcon className="wk-mui-icon" sx={{ fontSize: 20 }} aria-hidden />
      <span className="wk-color-icon-bar" style={{ backgroundColor: color }} aria-hidden />
    </span>
  );
}

export function WkFillColorIcon({ color }: { color: string }) {
  return (
    <span className="wk-color-icon">
      <FormatColorFillIcon className="wk-mui-icon" sx={{ fontSize: 20 }} aria-hidden />
      <span className="wk-color-icon-bar" style={{ backgroundColor: color }} aria-hidden />
    </span>
  );
}
