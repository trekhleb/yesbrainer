/**
 * Windowed Base Web menu for the model Selects.
 *
 * Base Web's stock StatefulMenu renders every filtered option at once. That
 * is fine for small selects, but the complete OpenRouter catalog turns one
 * focus event into hundreds of React/Styletron list-item mounts. This keeps
 * Base Web's state container (selection, keyboard navigation, disabled
 * options, active-descendant ids) and replaces only the stateless list with a
 * fixed-row window.
 */

import {
  OptionList,
  StatefulContainer,
  StyledEmptyState,
  StyledList,
  type Item,
  type Items,
  type MenuOverrides,
  type RenderProps,
  type RootRef,
  type StatefulContainerProps,
  type StatefulMenuProps,
} from 'baseui/menu'
import { getOverrides } from 'baseui/helpers/overrides'
import {
  useLayoutEffect,
  useMemo,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'

const ROW_HEIGHT = 36
const MAX_MENU_HEIGHT = 360
const OVERSCAN_ROWS = 3

interface WindowedMenuRenderProps extends RenderProps {
  activedescendantId?: string | null
  focusMenu?: (
    event: FocusEvent<HTMLElement> | MouseEvent<HTMLElement>,
  ) => unknown
  unfocusMenu?: () => unknown
  handleMouseLeave?: (event: MouseEvent<HTMLElement>) => unknown
  handleKeyDown?: (event: KeyboardEvent<HTMLElement>) => unknown
  rootRef: RootRef
}

interface WindowedMenuProps extends WindowedMenuRenderProps {
  noResultsMsg?: ReactNode
  overrides?: MenuOverrides
}

type VirtualizedStatefulMenuProps = StatefulMenuProps & {
  noResultsMsg?: ReactNode
}

function flattenItems(items: Items): readonly Item[] {
  if (Array.isArray(items)) return items
  return Object.values(items).flat()
}

function WindowedMenu({
  activedescendantId,
  focusMenu,
  getRequiredItemProps,
  handleKeyDown,
  handleMouseLeave,
  highlightedIndex,
  isFocused,
  items: groupedItems,
  noResultsMsg,
  overrides = {},
  rootRef,
  unfocusMenu,
}: WindowedMenuProps) {
  const items = useMemo(() => flattenItems(groupedItems), [groupedItems])
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(MAX_MENU_HEIGHT)
  const [List, listProps] = getOverrides(overrides.List, StyledList)
  const [Option, optionProps] = getOverrides(overrides.Option, OptionList)
  const [EmptyState, emptyStateProps] = getOverrides(
    overrides.EmptyState,
    StyledEmptyState,
  )
  const totalHeight = items.length * ROW_HEIGHT
  const height = Math.min(
    MAX_MENU_HEIGHT,
    Math.max(ROW_HEIGHT, totalHeight),
  )

  /*
   * Keep keyboard-highlighted rows inside the window. Calling
   * getRequiredItemProps here also allocates the active row's stable id
   * before aria-activedescendant is read by the root.
   */
  const activeProps =
    highlightedIndex >= 0 && highlightedIndex < items.length
      ? getRequiredItemProps(items[highlightedIndex], highlightedIndex)
      : undefined
  const activeId = activeProps?.id ?? activedescendantId ?? undefined

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const nextViewportHeight = root.clientHeight || height
    setViewportHeight(nextViewportHeight)

    let nextScrollTop = root.scrollTop
    if (highlightedIndex >= 0) {
      const rowTop = highlightedIndex * ROW_HEIGHT
      const rowBottom = rowTop + ROW_HEIGHT
      if (rowTop < nextScrollTop) nextScrollTop = rowTop
      else if (rowBottom > nextScrollTop + nextViewportHeight) {
        nextScrollTop = rowBottom - nextViewportHeight
      }
    } else if (items.length === 0) {
      nextScrollTop = 0
    }

    if (root.scrollTop !== nextScrollTop) root.scrollTop = nextScrollTop
    setScrollTop(nextScrollTop)
  }, [height, highlightedIndex, items, rootRef])

  const firstVisible = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
  )
  const lastVisible = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS,
  )
  const visibleItems = items.slice(firstVisible, lastVisible)

  return (
    <List
      {...listProps}
      aria-activedescendant={activeId}
      aria-label="Menu"
      data-baseweb="menu"
      onBlur={() => unfocusMenu?.()}
      onFocus={(event: FocusEvent<HTMLElement>) => focusMenu?.(event)}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (isFocused) handleKeyDown?.(event)
      }}
      onMouseEnter={(event: MouseEvent<HTMLElement>) => focusMenu?.(event)}
      onMouseLeave={handleMouseLeave}
      onMouseOver={(event: MouseEvent<HTMLElement>) => focusMenu?.(event)}
      onScroll={(event: React.UIEvent<HTMLElement>) =>
        setScrollTop(event.currentTarget.scrollTop)
      }
      ref={rootRef}
      role="listbox"
      style={{
        height,
        maxHeight: listProps.$maxHeight,
        overflowY: 'auto',
        paddingTop: 0,
        paddingBottom: 0,
      }}
      tabIndex={0}
      $isFocusVisible={false}
    >
      {items.length === 0 ? (
        <EmptyState {...emptyStateProps}>
          {noResultsMsg ?? 'No results'}
        </EmptyState>
      ) : (
        <>
          <li
            aria-hidden
            role="presentation"
            style={{ height: totalHeight, pointerEvents: 'none' }}
          />
          {visibleItems.map((item, visibleIndex) => {
            const index = firstVisible + visibleIndex
            const {
              disabled,
              isFocused: optionIsFocused,
              isHighlighted,
              resetMenu,
              ...requiredProps
            } = getRequiredItemProps(item, index)
            return (
              <Option
                key={String(item.id ?? index)}
                item={item}
                overrides={overrides}
                resetMenu={resetMenu}
                role="option"
                $disabled={disabled}
                $isFocused={optionIsFocused}
                $isHighlighted={isHighlighted}
                aria-disabled={disabled}
                aria-posinset={index + 1}
                aria-selected={isHighlighted && optionIsFocused}
                aria-setsize={items.length}
                {...requiredProps}
                {...optionProps}
                style={{
                  boxSizing: 'border-box',
                  height: ROW_HEIGHT,
                  left: 0,
                  overflow: 'hidden',
                  position: 'absolute',
                  textOverflow: 'ellipsis',
                  top: index * ROW_HEIGHT,
                  whiteSpace: 'nowrap',
                  width: '100%',
                }}
              />
            )
          })}
        </>
      )}
    </List>
  )
}

/**
 * Drop-in replacement for Base Web's StatefulMenu override. StatefulContainer
 * supplies the exact same selection and keyboard behavior as the stock menu;
 * WindowedMenu changes only how many rows are mounted.
 */
export function VirtualizedModelMenu({
  overrides,
  ...containerProps
}: VirtualizedStatefulMenuProps) {
  return (
    <StatefulContainer
      {...(containerProps as StatefulContainerProps)}
      children={(renderProps) => (
        <WindowedMenu
          {...(renderProps as WindowedMenuRenderProps)}
          noResultsMsg={containerProps.noResultsMsg}
          overrides={overrides}
        />
      )}
    />
  )
}
