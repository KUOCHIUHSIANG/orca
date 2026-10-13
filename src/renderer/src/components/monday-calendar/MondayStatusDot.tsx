export function MondayStatusDot(props: { color: string | null }): React.JSX.Element {
  return (
    <span
      className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
      // Why: the label color is monday.com data, not an Orca theme role.
      style={props.color ? { backgroundColor: props.color } : undefined}
    />
  )
}
