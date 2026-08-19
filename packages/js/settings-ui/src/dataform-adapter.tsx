/**
 * External dependencies
 */
import { createElement } from '@wordpress/element';
import type {
	Field,
	FieldTypeName,
	Form,
	FormField,
} from '@wordpress/dataviews';

/**
 * Internal dependencies
 */
import { error } from './diagnostics';
import { sanitizeSettingsHtml } from './html';
import {
	resolveFieldComponent,
	resolveFieldVisibilityPredicate,
	resolveGroupVisibilityPredicate,
} from './registry';
import type {
	SettingsFieldContext,
	SettingsUIField,
	SettingsUIGroup,
	SettingsUISchema,
	SettingsValue,
	SettingsValues,
	SettingsVisibilityPredicate,
} from './types';

// The adapter assumes the canonical value vocabulary from the PHP schema
// builder, so no value coercion happens here.

export type DataFormAdapterOptions = {
	schema: SettingsUISchema;
	context: SettingsFieldContext;
	initialValues: SettingsValues;
};

export type DataFormAdapter = {
	fields: Field< SettingsValues >[];
	getForm: ( values: SettingsValues ) => Form;
};

const toSanitizedDescription = ( description?: string ) =>
	description ? (
		<span
			dangerouslySetInnerHTML={ {
				__html: sanitizeSettingsHtml( description ),
			} }
		/>
	) : undefined;

// FormField descriptions are plain strings, so group descriptions lose markup.
const toPlainText = ( html?: string ) => {
	if ( ! html ) {
		return undefined;
	}

	const container = document.createElement( 'div' );
	container.innerHTML = sanitizeSettingsHtml( html );
	return container.textContent || undefined;
};

const areValuesEqual = ( a: SettingsValue, b: SettingsValue ) => {
	if ( Array.isArray( a ) || Array.isArray( b ) ) {
		return (
			Array.isArray( a ) &&
			Array.isArray( b ) &&
			a.length === b.length &&
			a.every( ( value, index ) => value === b[ index ] )
		);
	}

	return a === b;
};

const valueMatchesVisibilityRule = (
	value: SettingsValue,
	expected: SettingsValue | SettingsValue[] | undefined
) => {
	const expectedValues = Array.isArray( expected )
		? expected
		: [ expected ?? true ];

	return expectedValues.some( ( expectedValue ) =>
		areValuesEqual( value, expectedValue )
	);
};

type SettingsTypeDescriptor = {
	type: FieldTypeName;
	edit: string;
};

const settingsTypeDescriptors: Record< string, SettingsTypeDescriptor > = {
	checkbox: { type: 'boolean', edit: 'checkbox' },
	select: { type: 'text', edit: 'select' },
	radio: { type: 'text', edit: 'radio' },
	textarea: { type: 'text', edit: 'textarea' },
	number: { type: 'number', edit: 'number' },
	array: { type: 'array', edit: 'array' },
	text: { type: 'text', edit: 'text' },
	password: { type: 'password', edit: 'password' },
	'datetime-local': { type: 'datetime', edit: 'datetime' },
	date: { type: 'date', edit: 'date' },
	// DataForm has no time control; the plain text control carries the value.
	time: { type: 'text', edit: 'text' },
	email: { type: 'email', edit: 'email' },
	url: { type: 'url', edit: 'url' },
	tel: { type: 'telephone', edit: 'telephone' },
};

// Predicates fail open: a broken visibility callback renders the field or
// group rather than hiding it. The failure logs unconditionally because
// failing open can expose a field that was meant to stay hidden.
const runVisibilityPredicate = (
	predicate: SettingsVisibilityPredicate,
	kind: 'field' | 'group',
	id: string,
	values: SettingsValues,
	options: DataFormAdapterOptions
) => {
	try {
		return predicate( {
			values,
			initialValues: options.initialValues,
			context: options.context,
			schema: options.schema,
		} );
	} catch ( predicateError ) {
		error(
			`Visibility predicate for ${ kind } "${ id }" failed. Rendering it visible.`,
			{ error: predicateError, context: options.context }
		);
		return true;
	}
};

// Predicates resolve on every evaluation, so an extension that registers a
// predicate after the adapter is built still takes effect.
const createIsVisible = (
	settingsField: SettingsUIField,
	options: DataFormAdapterOptions
): Field< SettingsValues >[ 'isVisible' ] => {
	return ( item ) => {
		const predicate = resolveFieldVisibilityPredicate(
			settingsField.id,
			options.context
		);

		if ( predicate ) {
			return runVisibilityPredicate(
				predicate,
				'field',
				settingsField.id,
				item,
				options
			);
		}

		const visibility = settingsField.visibility;
		return visibility
			? valueMatchesVisibilityRule(
					item[ visibility.controller ],
					visibility.value
			  )
			: true;
	};
};

// Classic settings disable fields through custom_attributes with HTML
// presence semantics, so any defined value except boolean false disables.
const isFieldDisabled = ( settingsField: SettingsUIField ) => {
	if ( settingsField.disabled ) {
		return true;
	}

	const disabledAttribute = settingsField.customAttributes?.disabled;
	return (
		typeof disabledAttribute !== 'undefined' && disabledAttribute !== false
	);
};

export const buildDataFormField = (
	settingsField: SettingsUIField,
	options: DataFormAdapterOptions
): Field< SettingsValues > => {
	const descriptor = settingsTypeDescriptors[ settingsField.type ];
	const registeredComponent = resolveFieldComponent(
		settingsField,
		options.context
	);

	const field: Field< SettingsValues > = {
		id: settingsField.id,
		label: settingsField.label,
		description: toSanitizedDescription( settingsField.description ),
		placeholder: settingsField.placeholder,
		type: descriptor?.type ?? 'text',
		elements: settingsField.options,
		isVisible: createIsVisible( settingsField, options ),
		isDisabled: isFieldDisabled( settingsField ),
	};

	if ( registeredComponent ) {
		// A registered control accepts a frozen subset of the DataForm control
		// props, so the wider package props remain assignable to it.
		field.Edit = registeredComponent as Field< SettingsValues >[ 'Edit' ];
		return field;
	}

	// A field declaring a component requires that custom control. Failing
	// closed beats silently rendering a built-in control in its place.
	if ( settingsField.component ) {
		throw new Error(
			`Component "${ settingsField.component }" is not registered.`
		);
	}

	if ( settingsField.type === 'info' ) {
		field.readOnly = true;
		field.render = ( { field: normalizedField } ) =>
			normalizedField.description ?? null;
		return field;
	}

	// An unsupported type fails closed rather than silently dropping the
	// field beside a live Save button.
	if ( ! descriptor ) {
		throw new Error(
			`Field type "${ settingsField.type }" is not supported.`
		);
	}

	field.Edit = descriptor.edit;

	return field;
};

const buildGroupFormField = ( group: SettingsUIGroup ): FormField => ( {
	id: group.id,
	label: group.title || undefined,
	description: toPlainText( group.description ),
	layout: group.title
		? { type: 'card', isCollapsible: false }
		: { type: 'card', withHeader: false },
	children: group.fields.map( ( field ) => field.id ),
} );

export const createDataFormAdapter = (
	options: DataFormAdapterOptions
): DataFormAdapter => {
	const groups = Object.values( options.schema.groups );
	const fields = groups.flatMap( ( group ) =>
		group.fields.map( ( field ) => buildDataFormField( field, options ) )
	);
	const fieldsById = new Map(
		fields.map( ( field ) => [ field.id, field ] )
	);

	const isFieldVisible = ( fieldId: string, values: SettingsValues ) =>
		fieldsById.get( fieldId )?.isVisible?.( values ) !== false;

	const isGroupVisible = (
		group: SettingsUIGroup,
		values: SettingsValues
	) => {
		const predicate = resolveGroupVisibilityPredicate(
			group.id,
			options.context
		);
		if (
			predicate &&
			! runVisibilityPredicate(
				predicate,
				'group',
				group.id,
				values,
				options
			)
		) {
			return false;
		}

		return group.fields.some( ( field ) =>
			isFieldVisible( field.id, values )
		);
	};

	const getForm = ( values: SettingsValues ): Form => ( {
		fields: groups
			.filter( ( group ) => isGroupVisible( group, values ) )
			.map( buildGroupFormField ),
	} );

	return { fields, getForm };
};
