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

import DataGenerator from "./DataGenerator";

import AllChats from "./AllChats";

import ApiClientMenu from "./ApiClientMenu";

import ApiMenus from "./ApiMenus";

import EditClient from "./EditClient";

import MenuView from "./MenuView";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

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
                
                <Route path="/Chat" element={<Chat />} />
                
                <Route path="/MenuCreate" element={<MenuCreate />} />
                
                <Route path="/Users" element={<Users />} />
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/Clients" element={<Clients />} />
                
                <Route path="/Settings" element={<Settings />} />
                
                <Route path="/MenuEdit" element={<MenuEdit />} />
                
                <Route path="/MenuAnalysis" element={<MenuAnalysis />} />
                
                <Route path="/ClientProfile" element={<ClientProfile />} />
                
                <Route path="/ClientMenu" element={<ClientMenu />} />
                
                <Route path="/DataGenerator" element={<DataGenerator />} />
                
                <Route path="/AllChats" element={<AllChats />} />
                
                <Route path="/ApiClientMenu" element={<ApiClientMenu />} />
                
                <Route path="/ApiMenus" element={<ApiMenus />} />
                
                <Route path="/EditClient" element={<EditClient />} />
                
                <Route path="/MenuView" element={<MenuView />} />
                
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