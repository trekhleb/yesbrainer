/**
 * RTL render wrapped in the app's real providers — Styletron engine,
 * Base Web theme, a MemoryRouter (several components render <Link>s
 * or call navigate), and the app-wide ToasterContainer. One shared
 * engine instance: the atomic engine stacks style tags per instance,
 * and tests don't need isolation there.
 *
 * The ToasterContainer mirrors production (`theme-provider.tsx` mounts it
 * inside BaseProvider): without it, any component that fires `toaster.*`
 * throws "add the ToasterContainer" — which, when it happens inside a
 * try/catch, gets swallowed and re-thrown from the catch as an unhandled
 * rejection instead of a visible failure. Rendering the real host keeps
 * the toast paths exercisable and quiet.
 */

import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { BaseProvider, LightTheme } from 'baseui'
import { ToasterContainer } from 'baseui/toast'
import { Client as Styletron } from 'styletron-engine-atomic'
import { Provider as StyletronProvider } from 'styletron-react'
import { MemoryRouter } from 'react-router-dom'

const engine = new Styletron()

export function renderUi(
  ui: ReactElement,
  options: { route?: string } = {},
): RenderResult {
  return render(
    <StyletronProvider value={engine}>
      <BaseProvider theme={LightTheme}>
        <ToasterContainer>
          <MemoryRouter initialEntries={[options.route ?? '/']}>
            {ui}
          </MemoryRouter>
        </ToasterContainer>
      </BaseProvider>
    </StyletronProvider>,
  )
}
