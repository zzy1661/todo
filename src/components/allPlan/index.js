import React, { Component } from 'react';
import { Table, Button } from 'antd';
  
class AllPlan extends Component {
    
    state = {
      columns: [{
        title: '创建时间',
        dataIndex: 'creatime',
        key: 'creatime',
      }, {
        title: '任务名称',
        dataIndex: 'name',
        key: 'name',
      }, {
        title: '任务状态',
        dataIndex: 'status',
        key: 'status',
        render: status => {
          var statusList = ["已完成","进行中", "超时", "封存"];
          return (
            <span>{statusList[status]}</span>
          )
        }
      }, {
        title: '详情',
        key: 'describe',
        dataIndex: 'describe',
      }, {
        title: '操作',
        key: 'action',
        render: (text, record) => (
          <span>
            <Button type="primary" className="m-2">完成</Button>
            <Button type="primary" className="m-2">封存</Button>
            <Button type="primary" className="m-2">删除</Button>
          </span>
        ),
      }],
      data: null
    }
    
    componentDidMount() {
      var token = sessionStorage.getItem('userToken')
      fetch('http://localhost:8082/tasks',{
        method: 'GET',
        headers: {
          'Authorization':`Bearer ${token}`
        }
      }).then( res => {
        console.log(res)
        if(res.status == 401) {
          throw new Error(401) 
        }
        return res.json()
      })
      .then( data => {
        console.log('data',data)
        if(data.code === 0) {
          this.setState({
            data: data.data
          })
        }
      }).catch(e=>{
        sessionStorage.removeItem('username');
        sessionStorage.removeItem('userToken')
        if(e.message == 401) {
          this.props.history.push('/login');
        }
    })
    }

    render () {
        return (
            <Table rowKey="id" columns={this.state.columns} dataSource={this.state.data} />
        )
    }
}
export default AllPlan;