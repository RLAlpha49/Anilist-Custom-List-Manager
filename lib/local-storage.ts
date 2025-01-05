const DEFAULT_EXPIRY = 60 * 60 * 24 * 1000;

export const setItemWithExpiry = (key: string, value: any, ttl: number = DEFAULT_EXPIRY) => {
	const now = new Date();
	const item = {
		value: value,
		expiry: now.getTime() + ttl,
	};
	localStorage.setItem(key, JSON.stringify(item));
};

export const getItemWithExpiry = (key: string) => {
	const itemStr = localStorage.getItem(key);
	if (!itemStr) {
		return null;
	}
	const item = JSON.parse(itemStr);
	const now = new Date();
	if (now.getTime() > item.expiry) {
		removeItemWithExpiry(key);
		return null;
	}
	return item.value;
};

export const removeItemWithExpiry = (key: string) => {
	localStorage.removeItem(key);
};
