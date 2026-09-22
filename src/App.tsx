import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProductProvider } from './context/ProductContext';
import { OrderProvider } from './context/OrderContext';
import { ReturnProvider } from './context/ReturnContext';
import { UIProvider } from './context/UIContext';
import AppRoutes from './routes/AppRoutes';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <UIProvider>
        <AuthProvider>
          <ProductProvider>
            <OrderProvider>
              <ReturnProvider>
                <AppRoutes />
              </ReturnProvider>
            </OrderProvider>
          </ProductProvider>
        </AuthProvider>
      </UIProvider>
    </BrowserRouter>
  );
}

export default App;
