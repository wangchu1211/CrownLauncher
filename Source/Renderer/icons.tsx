import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function FolderIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="M1.75 4.25h4l1.2 1.5h7.3v7.5H1.75zM1.75 4.25V2.8h4.3l1.2 1.45" /></svg>;
}

export function DiamondIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="m8 1.75 6.25 6.25L8 14.25 1.75 8z" /></svg>;
}

export function SettingsIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="M6.75 1.5h2.5l.35 1.55 1.35.55 1.35-.85 1.75 1.8-.85 1.3.55 1.35 1.55.35v2.5l-1.55.35-.55 1.35.85 1.3-1.75 1.8-1.35-.85-1.35.55-.35 1.55h-2.5l-.35-1.55-1.35-.55-1.35.85-1.75-1.8.85-1.3-.55-1.35-1.55-.35v-2.5L2.3 7.2l.55-1.35L2 4.55l1.75-1.8 1.35.85 1.35-.55z" /><circle cx="8" cy="8.8" r="2.15" /></svg>;
}

export function SearchIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><circle cx="7" cy="7" r="4.25" /><path d="m10.3 10.3 3.45 3.45" /></svg>;
}

export function PinIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="M5 2.5h6M5.7 2.5v3.2L4 8h8l-1.7-2.3V2.5M8 8v5.5" /></svg>;
}

export function ProjectIcon(props: IconProps) {
  return <svg viewBox="0 0 36 36" aria-hidden="true" {...props}><path d="m18 2.5 13 7.2v15L18 33 5 24.7v-15zM5 9.7l13 7.7 13-7.7M18 17.4V33" /></svg>;
}

export function MoreIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><circle cx="3.25" cy="8" r=".8" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r=".8" fill="currentColor" stroke="none" /><circle cx="12.75" cy="8" r=".8" fill="currentColor" stroke="none" /></svg>;
}

export function RefreshIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="M13.5 5.8A5.8 5.8 0 1 0 13 11M13.5 2.5v3.7H9.8" /></svg>;
}

export function ChevronIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="m4.5 6 3.5 3.5L11.5 6" /></svg>;
}

export function CloseIcon(props: IconProps) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}
