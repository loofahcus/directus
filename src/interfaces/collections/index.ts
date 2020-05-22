import { defineInterface } from '@/interfaces/define';
import InterfaceCollections from './collections.vue';

export default defineInterface(({ i18n }) => ({
	id: 'collections',
	name: i18n.t('collections'),
	icon: 'featured_play_list',
	component: InterfaceCollections,
	options: [
		{
			field: 'includeSystem',
			name: i18n.t('system'),
			width: 'half',
			interface: 'toggle',
			options: {
				label: i18n.t('include_system_collections'),
			},
			default_value: false,
		},
	],
}));
