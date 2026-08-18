import React, { memo } from 'react';
import type { PricingData } from '../types';
import { usePrevious } from '../hooks/usePrevious';

interface DataRowProps {
  data: PricingData;
  isSelected: boolean;
  onSelect: (symbol: string) => void;
}

export const DataRow: React.FC<DataRowProps> = memo(({ data, isSelected, onSelect }) => {
  const prevPrice = usePrevious(data.underlying_price);

  let flashClass = '';
  if (prevPrice !== undefined && data.underlying_price !== prevPrice) {
    flashClass = data.underlying_price > prevPrice ? 'flash-up' : 'flash-down';
  }

  return (
    <tr 
      className={`data-row ${isSelected ? 'row-selected' : ''}`}
      onClick={() => onSelect(data.symbol)}
    >
      <td className="symbol-cell">{data.symbol}</td>
      <td className={`price-cell ${flashClass}`}>
        ${data.underlying_price.toFixed(2)}
      </td>
      <td className={`option-cell ${flashClass}`}>
        ${data.option_price.toFixed(3)}
      </td>
    </tr>
  );
});

DataRow.displayName = 'DataRow';