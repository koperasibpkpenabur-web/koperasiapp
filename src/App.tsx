import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProductProvider } from './context/ProductContext';
import { OrderProvider } from './context/OrderContext';
import { ReturnProvider } from './context/ReturnContext';
import { SettingsProvider } from './context/SettingsContext';
import { UIProvider } from './context/UIContext';
import AppRoutes from './routes/AppRoutes';
import './index.css';

function App() {
  return (
    <BrowserRouter basename="/koperasiapp">
      <UIProvider>
        <SettingsProvider>
          <AuthProvider>
            <ProductProvider>
              <OrderProvider>
                <ReturnProvider>
                  <AppRoutes />
                </ReturnProvider>
              </OrderProvider>
            </ProductProvider>
          </AuthProvider>
        </SettingsProvider>
      </UIProvider>
    </BrowserRouter>
  );
}

export default App;
