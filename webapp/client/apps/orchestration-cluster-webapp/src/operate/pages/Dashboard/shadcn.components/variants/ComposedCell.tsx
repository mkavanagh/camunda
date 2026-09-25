/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {DataTable, type DataTableColumn} from '@camunda/design-system';
import {cn} from '#/shared/cn';
import type {ExpandableListRow, ExpandableListVariantProps} from '../ExpandableList.types';

const ComposedCell: React.FC<ExpandableListVariantProps> = ({header, rows, renderExpansion, isPending}) => {
	const columns: DataTableColumn<ExpandableListRow>[] = [
		{
			id: 'content',
			header,
			cell: ({row}) => <div data-expandable={renderExpansion(row.original) !== null}>{row.original.content}</div>,
		},
	];

	return (
		<div
			className={cn(
				'contents',
				// The DS DataTable's `<table>` uses the browser's default auto
				// table-layout, so with the auto-injected expand-toggle column plus
				// this single content column, the content column sizes to the
				// widest row's label instead of the container — defeating
				// InstancesBar's own overflow/ellipsis truncation. `table-fixed`
				// plus a fixed width on the toggle column instead gives the content
				// column a stable, predictable remainder to truncate against.
				'[&_[data-slot=table]]:table-fixed',
				'[&_[data-slot=table-row]>[data-slot=table-head]:first-child]:w-10',
				'[&_tr:has([data-expandable=false])_[data-slot=data-table-expand-toggle]]:hidden!',
			)}
		>
			<DataTable<ExpandableListRow>
				size="sm"
				columns={columns}
				data={rows}
				expansion={renderExpansion}
				aria-label={header}
				getRowId={(row) => row.id}
				loading={isPending}
			/>
		</div>
	);
};

export {ComposedCell};
