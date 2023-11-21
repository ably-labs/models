import React from 'react';
import { useAlert, Alert } from '@/context/alert';

const typeToColour = (type: Alert['type']): string => {
  if (type === 'success') {
    return 'bg-green-500';
  }
  if (type === 'info') {
    return 'bg-blue-500';
  }
  if (type === 'warning') {
    return 'bg-yellow-500';
  }
  if (type === 'error') {
    return 'bg-red-500';
  }
  return 'bg-gray-500';
};

const Alert = ({ alert }: { alert: Alert }) => (
  <div className={`${typeToColour(alert.type)} text-white px-4 py-2 rounded mt-4 shadow`}>{alert.message}</div>
);

const AlertContainer = () => {
  const { alerts } = useAlert();
  return (
    <div className="fixed bottom-0 left-0 z-50 flex flex-col items-start space-y-4 p-4">
      {alerts.map((alert) => (
        <Alert
          key={alert.id}
          alert={alert}
        />
      ))}
    </div>
  );
};

export default AlertContainer;
