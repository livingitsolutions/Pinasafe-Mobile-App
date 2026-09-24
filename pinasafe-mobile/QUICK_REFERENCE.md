# Production-Ready Code - Quick Reference

## State Management

```typescript
// Use the hook
import { usePersonnel } from '../hooks/usePersonnel';

const { personnel, loading, error, createPersonnel, updatePersonnel } = usePersonnel();

// Personnel is automatically loaded and cached
// Force refresh: loadPersonnel(true)
```

## API Calls

```typescript
import { apiService } from '../services/apiService.refactored';

// GET with auto-retry
const result = await apiService.get('/endpoint');

// POST with data
const result = await apiService.post('/endpoint', { data });

// Handle response
if (result.error) {
  Alert.alert('Error', result.error);
  return;
}
// Use result.data
```

## Validation

```typescript
import { validators, sanitize } from '../utils/validators';

// Validate
const emailResult = validators.email(email);
if (!emailResult.isValid) {
  Alert.alert('Error', emailResult.error);
  return;
}

// Sanitize
const clean = sanitize.html(userInput);
```

## Logging

```typescript
import { logger } from '../utils/logger';

logger.debug('Debug info', data);
logger.info('Info message');
logger.warn('Warning');
logger.error('Error occurred', error);
logger.api('POST', '/endpoint', 200);
```

## UI Components

```typescript
import { Button, Input, LoadingSpinner, ErrorMessage, Card } from '../components/common';

// Button
<Button title="Submit" onPress={handleSubmit} loading={loading} variant="primary" />

// Input
<Input label="Email" value={email} onChangeText={setEmail} error={error} />

// Loading
<LoadingSpinner fullScreen text="Loading..." />

// Error
<ErrorMessage message="Failed" onRetry={handleRetry} />

// Card
<Card title="Title" subtitle="Subtitle">
  <Text>Content</Text>
</Card>
```

## Custom Hooks

```typescript
// Personnel Hook
const { personnel, loading, error, createPersonnel, updatePersonnel, deletePersonnel, getRescueMembers } = usePersonnel();

// Teams Hook
const { teams, loading, error, createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember } = useTeams();
```

## Common Patterns

### Form with Validation
```typescript
const [errors, setErrors] = useState<Record<string, string>>({});

const validate = () => {
  const newErrors: Record<string, string> = {};

  const emailResult = validators.email(email);
  if (!emailResult.isValid) newErrors.email = emailResult.error!;

  const phoneResult = validators.phone(phone);
  if (!phoneResult.isValid) newErrors.phone = phoneResult.error!;

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

const handleSubmit = async () => {
  if (!validate()) return;

  setLoading(true);
  try {
    await apiService.post('/endpoint', {
      email: sanitize.trim(email),
      phone: sanitize.phone(phone),
    });
    Alert.alert('Success');
  } catch (error) {
    logger.error('Submit failed', error);
    Alert.alert('Error', 'Failed to submit');
  } finally {
    setLoading(false);
  }
};
```

### Loading State
```typescript
const [loading, setLoading] = useState(false);

const handleAction = async () => {
  setLoading(true);
  try {
    const result = await apiService.get('/endpoint');
    if (result.error) {
      Alert.alert('Error', result.error);
      return;
    }
    // Success
  } finally {
    setLoading(false);
  }
};

// In JSX
{loading ? <LoadingSpinner /> : <Content />}
```

### Error Handling
```typescript
try {
  const result = await apiService.post('/endpoint', data);
  if (result.error) {
    Alert.alert('Error', result.error);
    return;
  }
  // Success
} catch (error) {
  logger.error('Operation failed', error);
  Alert.alert('Error', 'An unexpected error occurred');
}
```

## Integration Checklist

- [ ] Add `AppStateProvider` to `app/_layout.tsx`
- [ ] Replace `useState` + `useEffect` with custom hooks
- [ ] Add validation to all forms
- [ ] Replace `console.log` with `logger`
- [ ] Use common components instead of custom UI
- [ ] Add loading states to async operations
- [ ] Sanitize all user inputs
- [ ] Handle all errors properly

## File Locations

- State: `contexts/AppStateContext.tsx`
- API: `services/apiService.refactored.ts`
- Hooks: `hooks/usePersonnel.ts`, `hooks/useTeams.ts`
- Validation: `utils/validators.ts`
- Logger: `utils/logger.ts`
- Components: `components/common/`
- Docs: `PRODUCTION_READY_GUIDE.md`
