import type { ComponentType, CSSProperties } from 'react'

/** The minimal prop surface our structure / role icons are rendered with —
 *  a subset of react-icons' own props (size + the a11y flag). */
export interface IconProps {
  size?: number
  'aria-hidden'?: boolean
}

/**
 * Wrap a react-icons component so it always renders rotated by `deg` — defined
 * once and reused everywhere, instead of repeating a `transform` at each call
 * site (which would drift the moment one is missed). Returns a component with
 * the same `IconProps` surface, so it drops in anywhere a plain icon does.
 *
 * Used for the Parallel "fork": rotated so the root (your question) sits on top
 * and the branches fan downward to the parallel answers.
 */
export function rotated(
  Icon: ComponentType<IconProps & { style?: CSSProperties }>,
  deg: number,
): ComponentType<IconProps> {
  return function RotatedIcon(props: IconProps) {
    return <Icon {...props} style={{ transform: `rotate(${deg}deg)` }} />
  }
}
