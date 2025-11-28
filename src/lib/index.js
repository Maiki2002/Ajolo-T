// Reexport your entry components here
import { v4 as uuidv4 } from 'uuid';

export function generateUUID() {
	return uuidv4();
}
