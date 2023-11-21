import React, { ReactNode, createContext, useContext, useState } from 'react';

type AlertType = 'success' | 'info' | 'warning' | 'error' | 'default';

export type Alert = {
  id: number;
  message: string;
  type: AlertType;
};

interface AlertContextType {
  alerts: Alert[];
  setAlert: (message: string, type: AlertType) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const setAlert = (message: string, type: AlertType) => {
    const id = Date.now();
    setAlerts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((alert) => alert.id !== id));
    }, 5000);
  };

  return <AlertContext.Provider value={{ alerts, setAlert }}>{children}</AlertContext.Provider>;
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within a AlertProvider');
  }
  return context;
};
