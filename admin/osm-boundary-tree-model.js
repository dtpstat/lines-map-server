export function buildBoundaryTreeIndex(items) {
  const byId = new Map();
  const childrenByParent = new Map();
  for (const item of items) {
    byId.set(item.id, item);
    const children = childrenByParent.get(item.parentId) ?? [];
    children.push(item);
    childrenByParent.set(item.parentId, children);
  }
  return { byId, childrenByParent };
}

export function aggregateBoundaryBranchStatus(
  item,
  childrenByParent,
  memo = new Map(),
) {
  if (memo.has(item.id)) return memo.get(item.id);

  let totalCount = 1;
  let activeCount = item.active ? 1 : 0;
  for (const child of childrenByParent.get(item.id) ?? []) {
    const childStatus = aggregateBoundaryBranchStatus(
      child,
      childrenByParent,
      memo,
    );
    totalCount += childStatus.totalCount;
    activeCount += childStatus.activeCount;
  }

  const status = activeCount === 0
    ? 'inactive'
    : activeCount === totalCount
      ? 'active'
      : 'partial';
  const result = { status, activeCount, totalCount };
  memo.set(item.id, result);
  return result;
}
