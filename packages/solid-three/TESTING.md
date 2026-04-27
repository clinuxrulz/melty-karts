## Testing

`solid-three` provides a comprehensive testing framework for unit testing 3D components. The testing utilities are available as a separate export.

### Setup and Basic Testing

```tsx
import { test, TestCanvas } from "solid-three/testing"
import { render } from "@solidjs/testing-library"

test("renders a mesh", () => {
  const { canvas, scene, unmount, waitTillNextFrame } = test(() => (
    <T.Mesh>
      <T.BoxGeometry />
      <T.MeshBasicMaterial />
    </T.Mesh>
  ))

  expect(scene.children).toHaveLength(1)
  expect(scene.children[0]).toBeDefined()

  // Clean up
  unmount()
})

// Using TestCanvas for JSX-based testing
test("renders with TestCanvas", () => {
  render(() => (
    <TestCanvas camera={{ position: [0, 0, 5] }}>
      <T.Mesh>
        <T.BoxGeometry />
        <T.MeshBasicMaterial />
      </T.Mesh>
    </TestCanvas>
  ))

  // TestCanvas automatically handles the canvas setup
})
```

### Mock WebGL Context

The testing framework includes a mock WebGL2RenderingContext for environments without GPU support:

```tsx
import { WebGL2RenderingContext } from "solid-three/testing"

// Automatically used when real WebGL is unavailable
// Provides all WebGL methods as no-ops for testing
```

### Testing Events

```tsx
import { fireEvent } from "@solidjs/testing-library"
import { test } from "solid-three/testing"

test("handles click events", () => {
  let clicked = false

  const { canvas } = test(() => (
    <T.Mesh onClick={() => (clicked = true)}>
      <T.BoxGeometry />
      <T.MeshBasicMaterial />
    </T.Mesh>
  ))

  // Create a mock click event on the canvas
  const clickEvent = new MouseEvent("click")
  Object.defineProperty(clickEvent, "offsetX", { get: () => 640 })
  Object.defineProperty(clickEvent, "offsetY", { get: () => 400 })

  fireEvent(canvas, clickEvent)

  expect(clicked).toBe(true)
})
```

### Testing Hooks

```tsx
import { test } from "solid-three/testing"
import { useThree } from "solid-three"

test("useThree returns context", () => {
  let context

  const TestComponent = () => {
    context = useThree()
    return (
      <T.Mesh>
        <T.BoxGeometry />
        <T.MeshBasicMaterial />
      </T.Mesh>
    )
  }

  const { unmount } = test(() => <TestComponent />)

  expect(context.camera).toBeDefined()
  expect(context.gl).toBeDefined()
  expect(context.scene).toBeDefined()

  unmount()
})
```

### Testing Animations

```tsx
import { test } from "solid-three/testing"
import { useFrame } from "solid-three"

test("animates on frame", async () => {
  let rotation = 0

  const AnimatedBox = () => {
    useFrame(() => {
      rotation += 0.01
    })

    return <T.Mesh />
  }

  const { waitTillNextFrame } = test(() => <AnimatedBox />, { frameloop: "always" })

  // Wait for animation frame using test utility
  await waitTillNextFrame()

  expect(rotation).toBeGreaterThan(0)
})
```
