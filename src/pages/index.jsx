import Layout from "./Layout.jsx";

import Menus from "./Menus";

import Chat from "./Chat";

import MenuCreate from "./MenuCreate";

import Users from "./Users";

import Dashboard from "./Dashboard";

import Clients from "./Clients";

import Settings from "./Settings";

import MenuEdit from "./MenuEdit";

import MenuAnalysis from "./MenuAnalysis";

import ClientProfile from "./ClientProfile";

import ClientMenu from "./ClientMenu";

import DataGenerator from "./Data-Generator";

import AllChats from "./AllChats";

import ApiClientMenu from "./ApiClientMenu";

import ApiMenus from "./ApiMenus";

import EditClient from "./EditClient";

import MenuView from "./MenuView";

import MenuLoad from "./MenuLoad";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';

const PAGES = {
    
    Menus: Menus,
    
    Chat: Chat,
    
    MenuCreate: MenuCreate,
    
    Users: Users,
    
    Dashboard: Dashboard,
    
    Clients: Clients,
    
    Settings: Settings,
    
    MenuEdit: MenuEdit,
    
    MenuAnalysis: MenuAnalysis,
    
    ClientProfile: ClientProfile,
    
    ClientMenu: ClientMenu,
    
    DataGenerator: DataGenerator,
    
    AllChats: AllChats,
    
    ApiClientMenu: ApiClientMenu,
    
    ApiMenus: ApiMenus,
    
    EditClient: EditClient,
    
    MenuView: MenuView,
    
    MenuLoad: MenuLoad,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                <Route path="/" element={<Menus />} />
                <Route path="/Menus" element={<Menus />} />
                <Route path="/menus" element={<Navigate to="/Menus" replace />} />
                
                <Route path="/Chat" element={<Chat />} />
                <Route path="/chat" element={<Navigate to="/Chat" replace />} />
                
                <Route path="/MenuCreate" element={<MenuCreate />} />
                <Route path="/menucreate" element={<Navigate to="/MenuCreate" replace />} />
                
                <Route path="/Users" element={<Users />} />
                <Route path="/users" element={<Navigate to="/Users" replace />} />
                
                <Route path="/Dashboard" element={<Dashboard />} />
                <Route path="/dashboard" element={<Navigate to="/Dashboard" replace />} />
                
                <Route path="/Clients" element={<Clients />} />
                <Route path="/clients" element={<Navigate to="/Clients" replace />} />
                
                <Route path="/Settings" element={<Settings />} />
                <Route path="/settings" element={<Navigate to="/Settings" replace />} />
                
                <Route path="/MenuEdit" element={<MenuEdit />} />
                <Route path="/menuedit" element={<Navigate to="/MenuEdit" replace />} />
                
                <Route path="/MenuAnalysis" element={<MenuAnalysis />} />
                <Route path="/menuanalysis" element={<Navigate to="/MenuAnalysis" replace />} />
                
                <Route path="/ClientProfile" element={<ClientProfile />} />
                <Route path="/clientprofile" element={<Navigate to="/ClientProfile" replace />} />
                
                <Route path="/ClientMenu" element={<ClientMenu />} />
                <Route path="/clientmenu" element={<Navigate to="/ClientMenu" replace />} />
                
                <Route path="/Data-Generator" element={<DataGenerator />} />
                <Route path="/data-generator" element={<Navigate to="/Data-Generator" replace />} />
                
                <Route path="/AllChats" element={<AllChats />} />
                <Route path="/allchats" element={<Navigate to="/AllChats" replace />} />
                
                <Route path="/ApiClientMenu" element={<ApiClientMenu />} />
                <Route path="/apiclientmenu" element={<Navigate to="/ApiClientMenu" replace />} />
                
                <Route path="/ApiMenus" element={<ApiMenus />} />
                <Route path="/apimenus" element={<Navigate to="/ApiMenus" replace />} />
                
                <Route path="/EditClient" element={<EditClient />} />
                <Route path="/editclient" element={<Navigate to="/EditClient" replace />} />
                
                <Route path="/MenuView" element={<MenuView />} />
                <Route path="/menuview" element={<Navigate to="/MenuView" replace />} />
                
                <Route path="/MenuLoad" element={<MenuLoad />} />
                <Route path="/menuload" element={<Navigate to="/MenuLoad" replace />} />
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}