import { Button } from '@mui/material';
import { Link } from 'react-router-dom';
import { EmptyState } from './primitives';

/** Placeholder for screens listed in UI_SCREENS.md that have not been written yet. */
export default function NotBuiltYet({ screen }: { screen: string }) {
  return (
    <EmptyState
      icon="construction"
      title={screen}
      body="This screen is not built yet. See docs/STATUS.md §2."
      action={<Button variant="contained" component={Link} to="/home">Back to home</Button>}
    />
  );
}
