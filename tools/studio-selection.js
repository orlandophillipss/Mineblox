export function selectStudio(studios, preferredId) {
  const matches = studios.filter((studio) => studio.name === 'Mineblox.rbxlx');
  const previous = matches.find((studio) => studio.id === preferredId);
  if (previous) return previous.id;
  if (matches.length === 1) return matches[0].id;
  throw new Error(
    matches.length
      ? 'Multiple Mineblox Studio connections; cannot select the managed place safely'
      : 'Mineblox Studio is not connected; enable Studio as an MCP server',
  );
}
